import type { AdminDirectory, IdentityHasher } from './ports';

/** The administrator emails from the setting `ADMIN_EMAILS`: a comma separated list, spaces and blanks ignored. */
export function parseAdminEmails(setting: string | undefined): string[] {
  return (setting ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

/** Knows the administrators by the hash of their email, like every account: the emails are not kept after hashing. */
export class AdminIdentities implements AdminDirectory {
  private readonly hashes: ReadonlySet<string>;

  constructor(emails: readonly string[], hashIdentity: IdentityHasher) {
    this.hashes = new Set(emails.map(hashIdentity));
  }

  isAdmin(userHash: string): boolean {
    return this.hashes.has(userHash);
  }
}
