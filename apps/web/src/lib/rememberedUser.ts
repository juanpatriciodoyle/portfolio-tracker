const KEY = 'remembered_user';

/** What this device remembers of the last person who signed in with Google, so a passkey sign-in (which carries no email) can greet them by name. */
export interface RememberedUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

export function rememberUser(user: RememberedUser): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }));
  } catch {
    // Storage can be unavailable: a passkey sign-in then greets by the plain name.
  }
}

/** What was remembered for this account, or nothing when it was another person's (or nothing was kept). */
export function recallUser(id: string): RememberedUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as RememberedUser;
    return saved.id === id ? saved : null;
  } catch {
    return null;
  }
}
