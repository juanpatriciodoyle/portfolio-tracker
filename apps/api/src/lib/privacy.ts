import crypto from 'crypto';

const SALT = process.env.USER_HASH_SALT || 'portfolio-tracker-zero-knowledge-privacy-salt-2026';

/**
 * Converts a raw user identity string (e.g. Google ID or email) into an irreversible
 * SHA-256 cryptographic hash so no personal identifying information (PII) is stored in DB.
 */
export function hashUserIdentity(rawId: string): string {
  return crypto.createHmac('sha256', SALT).update(rawId.trim().toLowerCase()).digest('hex');
}
