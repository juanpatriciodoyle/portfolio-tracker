/** Joe's account: the "Sneak peek" guest. Keep in step with DEMO_USER_EMAIL in the API. */
const GUEST_EMAIL = 'demo@portfolio.local';

export function isGuestUser(user: { email?: string | null; name?: string | null } | null): boolean {
  return user?.email === GUEST_EMAIL;
}

/**
 * A guest session is a preview: signing out asks the server to erase what the guest changed and
 * restore Joe's defaults. It never blocks signing out: if the server cannot be reached, the next
 * guest session starts from the clean seed anyway.
 */
export async function endGuestSession(user: { email?: string | null; name?: string | null } | null, token: string | null): Promise<void> {
  if (!isGuestUser(user) || !token) return;
  try {
    await fetch('/api/auth/demo/reset', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // Ignored on purpose, see above.
  }
}
