/** The demo guest's display address. Display only: keep in step with GUEST_DISPLAY_EMAIL in the API. */
const GUEST_EMAIL = 'demo@portfolio.local';

/** Set when a guest's session ended on its own, so the sign-in screen can say so instead of just appearing. */
export const GUEST_ENDED_KEY = 'guest_session_ended';

interface GuestCandidate {
  email?: string | null;
  isGuest?: boolean;
}

export function isGuestUser(user: GuestCandidate | null): boolean {
  return user?.isGuest === true || user?.email === GUEST_EMAIL;
}

/**
 * A guest session is a preview: signing out asks the server to erase the guest's account, with everything in it. It
 * never blocks signing out: if the server cannot be reached, the account is erased within the hour anyway.
 */
export async function endGuestSession(user: GuestCandidate | null, token: string | null): Promise<void> {
  if (!isGuestUser(user) || !token) return;
  try {
    await fetch('/api/auth/demo/end', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // Ignored on purpose, see above.
  }
}

/**
 * The server says this guest's hour is over (their account is gone). The session is dropped and the page starts again at
 * the sign-in screen, which tells them. Anything else a server says is left to the caller.
 */
export function leaveEndedGuestSession(status: number, body: unknown): boolean {
  if (status !== 401 || (body as { code?: unknown } | null)?.code !== 'GUEST_SESSION_ENDED') return false;
  try {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    sessionStorage.setItem(GUEST_ENDED_KEY, '1');
  } catch {
    // Storage can be unavailable: the reload still shows the sign-in screen, because the next request is refused too.
  }
  window.location.reload();
  return true;
}

/** Whether a guest's session just ended on its own. Reading it changes nothing: `clearGuestEndedNotice` is what ends the notice. */
export function peekGuestEndedNotice(): boolean {
  try {
    return sessionStorage.getItem(GUEST_ENDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearGuestEndedNotice(): void {
  try {
    sessionStorage.removeItem(GUEST_ENDED_KEY);
  } catch {
    // Storage can be unavailable: the notice may show once more, which is harmless.
  }
}
