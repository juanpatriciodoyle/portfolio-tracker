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
export function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}
