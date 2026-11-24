import type { Request } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  /** The session was signed in as the administrator (only a Google-verified sign-in earns this). */
  admin?: boolean;
  /** The session belongs to a demo guest: it lasts an hour at most. */
  guest?: boolean;
}

/**
 * The signing secret comes from the environment only, and is read when it is used (not when this
 * module loads) so it does not matter whether dotenv has run yet. There is deliberately no
 * built-in fallback: a secret that lives in the repository protects nothing.
 */
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Add a long random value to apps/api/.env (see .env.example).');
  }
  return secret;
}

const SESSION_LIFETIME = '30d';
/** A demo guest's account is erased after an hour, so the session must not outlive it. Keep in step with GUEST_SESSION_MS. */
const GUEST_SESSION_LIFETIME = '1h';

/**
 * Generates a signed JWT session token for a pseudonymous userId. A claim is written only when it is true, so an
 * ordinary session carries nothing extra. A guest is never an administrator.
 */
export function generateToken(userId: string, claims: { admin?: boolean; guest?: boolean } = {}): string {
  const guest = claims.guest === true;
  const admin = claims.admin === true && !guest;
  return jwt.sign({ userId, ...(admin ? { admin: true } : {}), ...(guest ? { guest: true } : {}) }, jwtSecret(), {
    expiresIn: guest ? GUEST_SESSION_LIFETIME : SESSION_LIFETIME,
  });
}

export function verifyToken(token: string): { userId: string; admin: boolean; guest: boolean } | null {
  const secret = jwtSecret();
  try {
    const decoded = jwt.verify(token, secret) as { userId: string; admin?: boolean; guest?: boolean };
    const guest = decoded.guest === true;
    return { userId: decoded.userId, admin: decoded.admin === true && !guest, guest };
  } catch {
    return null;
  }
}
