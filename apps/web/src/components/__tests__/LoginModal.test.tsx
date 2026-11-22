import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoginModal from '../LoginModal';

// Mock simplewebauthn and react-oauth. The mock keeps the handlers so a test can play Google's answer.
const google = vi.hoisted(() => ({
  options: null as null | { onSuccess: (response: { access_token: string }) => Promise<void> },
}));
vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: (options: NonNullable<typeof google.options>) => {
    google.options = options;
    return vi.fn();
  },
}));

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

describe('LoginModal Component', () => {
  it('should render all three login options including the sneak peek demo box', () => {
    const onSuccess = vi.fn();
    render(<LoginModal onSuccess={onSuccess} />);

    expect(screen.getByText('Portfolio Tracker')).toBeInTheDocument();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    expect(screen.getByText('Continue with Passkey / Touch ID')).toBeInTheDocument();

    // Third box: Sneak peek demo button
    expect(screen.getByRole('button', { name: /Would you like to take a sneak peek\?/i })).toBeInTheDocument();
  });

  it('should trigger demo sign in when clicking Would you like to take a sneak peek?', async () => {
    const onSuccess = vi.fn();
    const mockDemoUser = {
      id: 'demo-user-123',
      email: 'demo@portfolio.local',
      name: 'Joe',
      country: 'Spain',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        token: 'mock-demo-token',
        user: mockDemoUser,
      }),
    } as Response);

    vi.stubGlobal('fetch', mockFetch);

    render(<LoginModal onSuccess={onSuccess} />);

    const demoButton = screen.getByRole('button', { name: /Would you like to take a sneak peek\?/i });
    fireEvent.click(demoButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(mockDemoUser);
    });
  });

  describe('Google sign-in', () => {
    it('sends the server only Google\'s access token: the server asks Google who it is, the browser never says', async () => {
      const onSuccess = vi.fn();
      const user = { id: 'u1', email: 'a@b.c', name: 'Ada' };
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, token: 't', user }) } as Response);
      vi.stubGlobal('fetch', mockFetch);
      render(<LoginModal onSuccess={onSuccess} />);

      await google.options!.onSuccess({ access_token: 'google-access-token' });

      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(user));
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/auth/google');
      expect(JSON.parse(init.body)).toEqual({ accessToken: 'google-access-token' });
    });

    it('never reads the profile from Google in the browser', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) } as Response);
      vi.stubGlobal('fetch', mockFetch);
      render(<LoginModal onSuccess={vi.fn()} />);

      await google.options!.onSuccess({ access_token: 'google-access-token' });

      await waitFor(() => expect(screen.getByText('nope')).toBeInTheDocument());
      expect(mockFetch.mock.calls.map(([url]) => url)).not.toContain('https://www.googleapis.com/oauth2/v3/userinfo');
    });

    it('shows what the server refused with, and does not sign in', async () => {
      const onSuccess = vi.fn();
      const refusal = 'Google could not confirm your sign-in. Try signing in again.';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: refusal }) } as Response));
      render(<LoginModal onSuccess={onSuccess} />);

      await google.options!.onSuccess({ access_token: 'stale' });

      await waitFor(() => expect(screen.getByText(refusal)).toBeInTheDocument());
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});
