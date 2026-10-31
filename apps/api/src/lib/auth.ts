import type { Request } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  userId?: string;
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

/** Stops a misconfigured server at boot with a clear message instead of failing on the first login. */
export function assertJwtSecretConfigured(): void {
  jwtSecret();
}

/**
 * Generates a signed JWT session token for a pseudonymous userId
 */
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, jwtSecret(), { expiresIn: '30d' });
}

export function verifyToken(token: string): { userId: string } | null {
  const secret = jwtSecret();
  try {
    return jwt.verify(token, secret) as { userId: string };
  } catch {
    return null;
  }
}
