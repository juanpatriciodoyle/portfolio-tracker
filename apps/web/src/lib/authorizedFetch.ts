import { leaveEndedGuestSession } from './guestSession';

const TOKEN_KEY = 'auth_token';

/** Storage can throw (private modes, blocked cookies): no token then simply means signed out. */
export function readAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * `fetch` for the original portfolio endpoints. Who is asking is carried by the bearer token alone:
 * callers never put a user id in the URL or the body.
 */
export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  // A demo guest whose hour is over is taken back to the sign-in screen, wherever in the app they were.
  if (response.status === 401) leaveEndedGuestSession(response.status, await response.clone().json().catch(() => null));
  return response;
}

/** Keeps the session the server just issued. Storage can throw: the person is then simply asked to sign in again next time. */
export function storeAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // See above.
  }
}
