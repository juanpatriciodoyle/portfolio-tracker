import type { Request } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  /** The session was signed in as the administrator (only a Google-verified sign-in earns this). */
  admin?: boolean;
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

/**
 * Generates a signed JWT session token for a pseudonymous userId. The admin claim is written only when it is true,
 * so an ordinary session carries nothing extra.
 */
export function generateToken(userId: string, claims: { admin?: boolean } = {}): string {
  return jwt.sign(claims.admin ? { userId, admin: true } : { userId }, jwtSecret(), { expiresIn: '30d' });
}

export function verifyToken(token: string): { userId: string; admin: boolean } | null {
  const secret = jwtSecret();
  try {
    const decoded = jwt.verify(token, secret) as { userId: string; admin?: boolean };
    return { userId: decoded.userId, admin: decoded.admin === true };
  } catch {
    return null;
  }
}
