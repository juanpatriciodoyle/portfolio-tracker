import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { GUEST_ENDED_KEY } from '../../lib/guestSession';
import { createMemoryStorage } from '../../test/memoryStorage';
import LoginModal from '../LoginModal';

// Mock react-oauth. The mock keeps the handlers so a test can play Google's answer.
const google = vi.hoisted(() => ({
  options: null as null | { onSuccess: (response: { access_token: string }) => Promise<void> },
}));
vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: (options: NonNullable<typeof google.options>) => {
    google.options = options;
    return vi.fn();
  },
}));

// Whether this deployment has a Google client id; each test sets it.
const googleConfig = vi.hoisted(() => ({ configured: true }));
vi.mock('../../lib/googleConfig', () => ({ GOOGLE_CLIENT_ID: 'test-client', isGoogleSignInConfigured: () => googleConfig.configured }));

// What the server says about the demo; each test sets it.
const appConfig = vi.hoisted(() => ({ demoEnabled: true as boolean | null }));
vi.mock('../../hooks/useAppConfig', () => ({ useAppConfig: () => appConfig }));

// The browser's passkey prompt, and whether this browser has one.
const passkeys = vi.hoisted(() => ({ supported: true, startAuthentication: vi.fn() }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => passkeys.supported,
  startAuthentication: passkeys.startAuthentication,
  startRegistration: vi.fn(),
}));

const ANA = { id: 'u1', email: 'ana@example.com', name: 'Ana', country: 'Spain', isAdmin: false, hasPasskey: false, isGuest: false };
const JOE = { id: 'guest-1', email: 'demo@portfolio.local', name: 'Joe', country: 'Spain', isAdmin: false, hasPasskey: false, isGuest: true };

/** A fetch that answers each call in turn with a JSON body and a status. */
const answers = (...replies: Array<{ status?: number; body: unknown }>) => {
  const fetchMock = vi.fn();
  for (const { status = 200, body } of replies) fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body } as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  appConfig.demoEnabled = true;
  googleConfig.configured = true;
  google.options = null;
  passkeys.supported = true;
  passkeys.startAuthentication.mockReset();
  vi.stubGlobal('localStorage', createMemoryStorage());
  vi.stubGlobal('sessionStorage', createMemoryStorage());
});

describe('LoginModal: what it says and offers', () => {
  it('says what the app is for, and what is private, in plain words', () => {
    render(<LoginModal onSuccess={vi.fn()} />);

    expect(screen.getByText('Portfolio Tracker')).toBeInTheDocument();
    expect(screen.getByText('See everything you own in one calm place')).toBeInTheDocument();
    expect(screen.getByText('No passwords. No problems.')).toBeInTheDocument();
    expect(screen.queryByText(/biometric/i)).not.toBeInTheDocument();
  });

  it('has Google as the way in, a passkey for those who have one, and the demo', () => {
    render(<LoginModal onSuccess={vi.fn()} />);

    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeInTheDocument();
  });

  it('never asks for an email: nobody types anything to sign in', () => {
    render(<LoginModal onSuccess={vi.fn()} />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('has no emoji on the demo button', () => {
    render(<LoginModal onSuccess={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Try the demo' }).textContent).toBe('Try the demo');
  });
});

describe('LoginModal: the demo exists only when the server has it', () => {
  it('shows it when the server says it is on', () => {
    render(<LoginModal onSuccess={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeInTheDocument();
  });

  it.each([false, null])('hides it, and its explanation, when the server says %s', (demoEnabled) => {
    appConfig.demoEnabled = demoEnabled;
    render(<LoginModal onSuccess={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Try the demo' })).not.toBeInTheDocument();
    expect(screen.queryByText(/demo portfolio/i)).not.toBeInTheDocument();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });
});

describe('LoginModal: each way in exists only where it can work', () => {
  it('has no Google button, and starts nothing of Google, when the deployment has no client id', () => {
    googleConfig.configured = false;
    render(<LoginModal onSuccess={vi.fn()} />);

    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
    expect(google.options).toBeNull();
  });

  it('has no passkey button in a browser without passkeys', () => {
    passkeys.supported = false;
    render(<LoginModal onSuccess={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).not.toBeInTheDocument();
  });
});

describe('LoginModal: Google sign-in', () => {
  it('sends the server only Google’s access token: the server asks Google who it is, the browser never says', async () => {
    const onSuccess = vi.fn();
    const fetchMock = answers({ body: { success: true, token: 't', user: ANA } });
    render(<LoginModal onSuccess={onSuccess} />);

    await google.options!.onSuccess({ access_token: 'google-access-token' });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(ANA));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/google');
    expect(JSON.parse(init.body)).toEqual({ accessToken: 'google-access-token' });
    expect(localStorage.getItem('auth_token')).toBe('t');
  });

  it('never reads the profile from Google in the browser', async () => {
    const fetchMock = answers({ status: 401, body: { error: 'nope', code: 'GOOGLE_TOKEN_UNVERIFIED' } });
    render(<LoginModal onSuccess={vi.fn()} />);

    await google.options!.onSuccess({ access_token: 'google-access-token' });

    await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('https://www.googleapis.com/oauth2/v3/userinfo');
  });

  it('shows what the server refused with, and does not sign in', async () => {
    const onSuccess = vi.fn();
    const refusal = 'Google could not confirm your sign-in. Try signing in again.';
    answers({ status: 401, body: { error: refusal, code: 'GOOGLE_TOKEN_UNVERIFIED' } });
    render(<LoginModal onSuccess={onSuccess} />);

    await google.options!.onSuccess({ access_token: 'stale' });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(refusal));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('remembers who signed in, so a passkey sign-in on this device can greet them by name', async () => {
    answers({ body: { success: true, token: 't', user: ANA } });
    render(<LoginModal onSuccess={vi.fn()} />);

    await google.options!.onSuccess({ access_token: 'x' });

    await waitFor(() => expect(JSON.parse(localStorage.getItem('remembered_user')!)).toMatchObject({ id: 'u1', name: 'Ana', email: 'ana@example.com' }));
  });
});

describe('LoginModal: the demo', () => {
  it('starts a demo account of its own, and signs in as the guest', async () => {
    const onSuccess = vi.fn();
    const fetchMock = answers({ body: { success: true, token: 'guest-token', user: JOE } });
    render(<LoginModal onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(JOE));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/demo');
    expect(localStorage.getItem('auth_token')).toBe('guest-token');
    // a guest is nobody to remember
    expect(localStorage.getItem('remembered_user')).toBeNull();
  });

  it('says so when the demo is busy, in words, and signs nobody in', async () => {
    const onSuccess = vi.fn();
    answers({ status: 503, body: { error: 'The demo is busy right now. Try again in a few minutes.', code: 'DEMO_BUSY' } });
    render(<LoginModal onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try the demo' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The demo is busy right now'));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('tells a guest whose hour ended, once, why they are here', () => {
    sessionStorage.setItem(GUEST_ENDED_KEY, '1');

    const { unmount } = render(<LoginModal onSuccess={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Your demo session has ended');
    unmount();

    render(<LoginModal onSuccess={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('LoginModal: sign-in with a passkey', () => {
  const options = { challengeId: 'challenge-1', options: { challenge: 'abc', rpId: 'localhost' } };
  const credential = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: {} };

  it('asks the browser for any passkey it holds, with no email involved, and signs in with the answer', async () => {
    const onSuccess = vi.fn();
    passkeys.startAuthentication.mockResolvedValue(credential);
    const passkeyUser = { id: 'u1', name: 'Investor', country: 'Spain', isAdmin: false, hasPasskey: true, isGuest: false };
    const fetchMock = answers({ body: options }, { body: { success: true, token: 'passkey-token', user: passkeyUser } });
    render(<LoginModal onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [optionsCall, verifyCall] = fetchMock.mock.calls;
    expect(optionsCall[0]).toBe('/api/auth/passkey/sign-in/options');
    expect(JSON.parse(optionsCall[1].body)).toEqual({});
    expect(verifyCall[0]).toBe('/api/auth/passkey/sign-in/verify');
    expect(JSON.parse(verifyCall[1].body)).toEqual({ challengeId: 'challenge-1', credential });
    expect(passkeys.startAuthentication).toHaveBeenCalledWith({ optionsJSON: options.options });
    expect(localStorage.getItem('auth_token')).toBe('passkey-token');
  });

  it('puts back the name this device remembers from the last Google sign-in', async () => {
    localStorage.setItem('remembered_user', JSON.stringify({ id: 'u1', name: 'Ana', email: 'ana@example.com' }));
    const onSuccess = vi.fn();
    passkeys.startAuthentication.mockResolvedValue(credential);
    answers({ body: options }, { body: { success: true, token: 't', user: { id: 'u1', name: 'Investor', country: 'Spain', isAdmin: false, hasPasskey: true, isGuest: false } } });
    render(<LoginModal onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0]).toMatchObject({ id: 'u1', name: 'Ana', email: 'ana@example.com' });
  });

  it('does not borrow another person’s remembered name', async () => {
    localStorage.setItem('remembered_user', JSON.stringify({ id: 'someone-else', name: 'Ana' }));
    const onSuccess = vi.fn();
    passkeys.startAuthentication.mockResolvedValue(credential);
    answers({ body: options }, { body: { success: true, token: 't', user: { id: 'u1', name: 'Investor', country: 'Spain', isAdmin: false, hasPasskey: true, isGuest: false } } });
    render(<LoginModal onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0].name).toBe('Investor');
  });

  it('explains how to get a passkey when the prompt is cancelled or the device has none', async () => {
    passkeys.startAuthentication.mockRejectedValue(Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' }));
    answers({ body: options });
    render(<LoginModal onSuccess={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sign in with Google, then add one'));
  });

  it('shows the refusal of the server by its words, and signs nobody in', async () => {
    const onSuccess = vi.fn();
    passkeys.startAuthentication.mockResolvedValue(credential);
    answers({ body: options }, { status: 401, body: { error: 'No account has this passkey. Sign in with Google, then add a passkey from your account.', code: 'PASSKEY_UNKNOWN' } });
    render(<LoginModal onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No account has this passkey'));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
