import { z } from 'zod';
import { signedInUserSchema, type SignedInUserDto } from '../contracts';

const KEY = 'auth_user';

/** What this browser kept of the signed-in person. A session saved before a field existed reads as "no": it never fails. */
const storedUserSchema = signedInUserSchema.extend({
  isAdmin: z.boolean().catch(false),
  hasPasskey: z.boolean().catch(false),
  isGuest: z.boolean().catch(false),
});

/** The person signed in on this device, or null when nobody is, or what was kept is not a person. */
export function readStoredUser(): SignedInUserDto | null {
  try {
    const saved = localStorage.getItem(KEY);
    if (!saved) return null;
    const parsed = storedUserSchema.safeParse(JSON.parse(saved));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeStoredUser(user: SignedInUserDto): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // Storage can be unavailable: the session still works until the page is closed.
  }
}

export function clearStoredUser(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // See above.
  }
}
