import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pendingRequest, tapTwice } from '../../test/doubleTap';
import { createMemoryStorage } from '../../test/memoryStorage';
import AddPasskeyButton from '../AddPasskeyButton';

const browser = vi.hoisted(() => ({ startRegistration: vi.fn() }));
vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: () => true, startRegistration: browser.startRegistration, startAuthentication: vi.fn() }));

const optionsAnswer = { options: { challenge: 'abc', rp: { id: 'localhost', name: 'Portfolio Tracker' }, user: { id: 'dXNlci0x', name: 'Portfolio Tracker', displayName: 'Portfolio Tracker' } } };
const credential = { id: 'new-cred', rawId: 'new-cred', type: 'public-key', response: {} };

const respond = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  browser.startRegistration.mockReset();
  vi.stubGlobal('localStorage', createMemoryStorage({ auth_token: 'session-token' }));
});

describe('adding a passkey from the top bar', () => {
  it('offers a key button while the account has no passkey, and nothing once it has one', () => {
    const { rerender } = render(<AddPasskeyButton label="ana@example.com" hasPasskey={false} onAdded={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add a passkey' })).toBeInTheDocument();

    rerender(<AddPasskeyButton label="ana@example.com" hasPasskey onAdded={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument();
  });

  it('asks the server as the signed-in person, names the passkey in the browser, and saves it', async () => {
    const onAdded = vi.fn();
    browser.startRegistration.mockResolvedValue(credential);
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(optionsAnswer)).mockResolvedValueOnce({ ok: true, status: 204 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    render(<AddPasskeyButton label="ana@example.com" hasPasskey={false} onAdded={onAdded} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    const [optionsCall, verifyCall] = fetchMock.mock.calls;
    expect(optionsCall[0]).toBe('/api/auth/passkey/register/options');
    expect(new Headers(optionsCall[1].headers).get('Authorization')).toBe('Bearer session-token');
    expect(verifyCall[0]).toBe('/api/auth/passkey/register/verify');
    expect(JSON.parse(verifyCall[1].body)).toEqual({ credential });
    // the email only ever names the passkey inside the browser: the server is never told it
    expect(browser.startRegistration.mock.calls[0][0].optionsJSON.user).toMatchObject({ name: 'ana@example.com', displayName: 'ana@example.com' });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('ana@example.com');
    expect(screen.getByRole('status')).toHaveTextContent('Passkey added');
  });

  it('keeps the note on screen after the button is gone, then removes it by itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    browser.startRegistration.mockResolvedValue(credential);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respond(optionsAnswer)).mockResolvedValueOnce({ ok: true, status: 204 } as Response));
    function Parent() {
      return <AddPasskeyButton label="ana" hasPasskey={added} onAdded={() => { added = true; rerenderParent(); }} />;
    }
    let added = false;
    let rerenderParent: () => void = () => undefined;
    const view = render(<Parent />);
    rerenderParent = () => view.rerender(<Parent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Passkey added'));
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument();
    await act(async () => void vi.advanceTimersByTime(6500));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    vi.useRealTimers();
  });

  it('says it was cancelled, saves nothing, and leaves the button for another try', async () => {
    const onAdded = vi.fn();
    browser.startRegistration.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'NotAllowedError' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respond(optionsAnswer)));
    render(<AddPasskeyButton label="ana" hasPasskey={false} onAdded={onAdded} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/cancelled/i));
    expect(onAdded).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add a passkey' })).toBeEnabled();
  });

  it('shows the server’s refusal, such as an account that already has one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respond({ error: 'This account already has a passkey.', code: 'PASSKEY_ALREADY_ADDED' }, 409)));
    render(<AddPasskeyButton label="ana" hasPasskey={false} onAdded={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('This account already has a passkey.'));
  });

  it('taps twice, asks once', async () => {
    const request = pendingRequest<Response>();
    const fetchMock = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<AddPasskeyButton label="ana" hasPasskey={false} onAdded={vi.fn()} />);

    tapTwice(screen.getByRole('button', { name: 'Add a passkey' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => request.settle(respond({ error: 'no' }, 400)));
  });
});
