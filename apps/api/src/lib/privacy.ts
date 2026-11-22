import crypto from 'crypto';
import type { IdentityHasher } from '../application/ports';

/**
 * Converts a raw user identity string (e.g. an email) into an irreversible keyed hash (HMAC-SHA256), so no personal
 * identifying information is stored. The salt is the key: there is no built-in one, because a salt that lives in
 * the repository protects nothing.
 */
export function createIdentityHasher(salt: string): IdentityHasher {
  return (rawId) => crypto.createHmac('sha256', salt).update(rawId.trim().toLowerCase()).digest('hex');
}

let configured: IdentityHasher | null = null;

/** Called once when the server starts, with the salt from the settings (tests call it with a throwaway one). */
export function configureIdentityHashing(salt: string): void {
  configured = createIdentityHasher(salt);
}

export function hashUserIdentity(rawId: string): string {
  if (!configured) throw new Error('Identity hashing has no salt yet: configureIdentityHashing(salt) runs when the server starts.');
  return configured(rawId);
}
