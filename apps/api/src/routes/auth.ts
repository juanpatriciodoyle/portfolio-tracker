import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AuthService } from '../application/authService';
import { SignInRejectedError, type SignInRejection } from '../application/errors';
import type { SlidingWindowRateLimiter } from '../application/limits';
import type { ApiErrorResponse } from '../contracts';
import { errorName, log } from '../lib/logger';
import { requireUser, respondWithError, userIdOf } from './http';

/** How each refusal is answered. The code travels in the body, next to the English sentence. */
export const REJECTION_STATUS: Record<SignInRejection, number> = {
  GOOGLE_TOKEN_NEEDED: 400,
  GOOGLE_TOKEN_UNVERIFIED: 401,
  GOOGLE_NOT_CONFIGURED: 503,
  GOOGLE_SIGN_IN_FAILED: 500,
  REGISTRATION_CLOSED: 403,
  TOO_MANY_ATTEMPTS: 429,
  PASSKEY_REQUEST_INVALID: 400,
  PASSKEY_CHALLENGE_EXPIRED: 400,
  PASSKEY_UNVERIFIED: 400,
  PASSKEY_UNKNOWN: 401,
  PASSKEY_START_FAILED: 500,
  PASSKEY_NOT_FOR_ADMIN: 403,
  PASSKEY_NOT_FOR_GUEST: 403,
  PASSKEY_ALREADY_ADDED: 409,
  DEMO_UNAVAILABLE: 500,
  DEMO_BUSY: 503,
  NOT_A_GUEST: 403,
  GUEST_SESSION_ENDED: 401,
};

/** Answers a refusal: its status, its sentence and its code. */
export function refuse(res: Response, code: SignInRejection): void {
  res.status(REJECTION_STATUS[code]).json({ error: new SignInRejectedError(code).message, code } satisfies ApiErrorResponse);
}

/** Only the token Google issued counts. Any identity the browser claims in the body is ignored, so it is never trusted. */
const googleSignInBody = z.object({ accessToken: z.string().min(1) });

/** The prompt's answer. Its inner structure is the authenticator's to check; here it only has to look like one. */
const passkeyCredential = z.looseObject({
  id: z.string(),
  rawId: z.string(),
  type: z.literal('public-key'),
  response: z.looseObject({}),
});
const passkeySignInBody = z.object({ challengeId: z.string().min(1), credential: passkeyCredential });
const passkeyRegisterBody = z.object({ credential: passkeyCredential });

export interface AuthRouterOptions {
  /** Attempts allowed per address across every sign-in endpoint. */
  readonly limiter: SlidingWindowRateLimiter;
}

/** The limit every way of signing in shares (Google, passkeys, the demo): the same allowance per address. */
export function createThrottle(limiter: SlidingWindowRateLimiter) {
  return (req: Request, res: Response, next: NextFunction) => {
    const decision = limiter.tryAcquire(req.ip ?? 'unknown');
    if (decision.allowed) return next();
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    refuse(res, 'TOO_MANY_ATTEMPTS');
  };
}

/**
 * Passwordless sign-in. Google creates and opens accounts; a passkey is added afterwards by someone who is signed in,
 * and then signs in on its own. Every success answers the session the web app stores; every refusal carries a code.
 */
export function createAuthRouter(auth: AuthService, { limiter }: AuthRouterOptions): Router {
  const router = Router();
  const throttle = createThrottle(limiter);

  /** A refusal is answered as such; anything else is a failure of ours and is logged by kind only. */
  const fail = (res: Response, error: unknown, event: string, fallback: SignInRejection | null) => {
    if (error instanceof SignInRejectedError) return refuse(res, error.code);
    if (fallback === null) return respondWithError(error, res);
    log.error(event, { error: errorName(error) });
    refuse(res, fallback);
  };

  router.post('/auth/google', throttle, async (req, res) => {
    const body = googleSignInBody.safeParse(req.body);
    if (!body.success) return refuse(res, 'GOOGLE_TOKEN_NEEDED');
    try {
      res.status(200).json({ success: true, ...(await auth.signInWithGoogle(body.data.accessToken)) });
    } catch (error) {
      fail(res, error, 'google_sign_in_failed', 'GOOGLE_SIGN_IN_FAILED');
    }
  });

  router.post('/auth/passkey/sign-in/options', throttle, async (_req, res) => {
    try {
      res.json(await auth.passkeySignInChallenge());
    } catch (error) {
      fail(res, error, 'passkey_sign_in_options_failed', 'PASSKEY_START_FAILED');
    }
  });

  router.post('/auth/passkey/sign-in/verify', throttle, async (req, res) => {
    const body = passkeySignInBody.safeParse(req.body);
    if (!body.success) return refuse(res, 'PASSKEY_REQUEST_INVALID');
    try {
      res.json({ success: true, ...(await auth.signInWithPasskey(body.data.challengeId, body.data.credential)) });
    } catch (error) {
      fail(res, error, 'passkey_sign_in_failed', 'PASSKEY_UNVERIFIED');
    }
  });

  // Saving a passkey is for the account that is signed in: who it is comes from the session, never from the request.
  router.post('/auth/passkey/register/options', throttle, requireUser, async (req, res) => {
    try {
      res.json({ options: await auth.passkeyRegistrationOptions(userIdOf(req)) });
    } catch (error) {
      fail(res, error, 'passkey_registration_options_failed', null);
    }
  });

  router.post('/auth/passkey/register/verify', throttle, requireUser, async (req, res) => {
    const body = passkeyRegisterBody.safeParse(req.body);
    if (!body.success) return refuse(res, 'PASSKEY_REQUEST_INVALID');
    try {
      await auth.addPasskey(userIdOf(req), body.data.credential);
      res.status(204).end();
    } catch (error) {
      fail(res, error, 'passkey_registration_failed', null);
    }
  });

  return router;
}
