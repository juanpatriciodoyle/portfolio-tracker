import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AuthService } from '../application/authService';
import { SignInRejectedError, type SignInRejection } from '../application/errors';
import type { SlidingWindowRateLimiter } from '../application/limits';
import type { ApiErrorResponse } from '../contracts';
import { errorName, log } from '../lib/logger';

const GOOGLE_TOKEN_NEEDED = 'Google did not send a sign-in token. Try signing in again.';
const TOO_MANY_ATTEMPTS = 'Too many sign-in attempts. Wait a moment and try again.';
const GOOGLE_SIGN_IN_FAILED = 'Google sign-in failed on our side. Try again in a moment, or sign in with a passkey.';
const PASSKEY_EMAIL_NEEDED = 'Enter your email so we can find your passkey.';
const PASSKEY_START_FAILED = 'Could not start the passkey prompt. Try again in a moment.';
const PASSKEY_PROOF_NEEDED = 'Enter your email and confirm the passkey prompt to sign in.';
const PASSKEY_VERIFY_FAILED = 'The passkey could not be verified. Try again, or sign in another way.';

/** Only the token Google issued counts. Any identity the browser claims in the body is ignored, so it is never trusted. */
const googleSignInBody = z.object({ accessToken: z.string().min(1) });

const REJECTION_STATUS: Record<SignInRejection, number> = {
  GOOGLE_TOKEN_UNVERIFIED: 401,
  GOOGLE_NOT_CONFIGURED: 503,
  PASSKEY_NEEDS_SIGN_IN: 403,
  PASSKEY_NOT_FOR_ADMIN: 403,
  REGISTRATION_CLOSED: 403,
};

const passkeyEmailBody = z.object({ email: z.string().min(1) });

/** The prompt's answer. Its inner structure is the authenticator's to check; here it only has to look like one. */
const passkeyVerifyBody = z.object({
  email: z.string().min(1),
  credential: z.looseObject({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    response: z.looseObject({}),
  }),
});

const reply = (res: Response, status: number, error: string) => res.status(status).json({ error } satisfies ApiErrorResponse);

export interface AuthRouterOptions {
  /** Attempts allowed per address across the three sign-in endpoints. */
  readonly limiter: SlidingWindowRateLimiter;
}

/** Passwordless sign-in: Google and passkeys. Every success answers the session the web app stores. */
export function createAuthRouter(auth: AuthService, { limiter }: AuthRouterOptions): Router {
  const router = Router();

  const throttle = (req: Request, res: Response, next: NextFunction) => {
    const decision = limiter.tryAcquire(req.ip ?? 'unknown');
    if (decision.allowed) return next();
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    reply(res, 429, TOO_MANY_ATTEMPTS);
  };

  router.post('/auth/google', throttle, async (req, res) => {
    const body = googleSignInBody.safeParse(req.body);
    if (!body.success) return void reply(res, 400, GOOGLE_TOKEN_NEEDED);
    try {
      const signedIn = await auth.signInWithGoogle(body.data.accessToken);
      res.status(200).json({ success: true, ...signedIn });
    } catch (error) {
      if (error instanceof SignInRejectedError) return void reply(res, REJECTION_STATUS[error.code], error.message);
      log.error('google_sign_in_failed', { error: errorName(error) });
      reply(res, 500, GOOGLE_SIGN_IN_FAILED);
    }
  });

  router.post('/auth/passkey/generate-options', throttle, async (req, res) => {
    const body = passkeyEmailBody.safeParse(req.body);
    if (!body.success) return void reply(res, 400, PASSKEY_EMAIL_NEEDED);
    try {
      res.json(await auth.passkeyChallenge(body.data.email));
    } catch (error) {
      if (error instanceof SignInRejectedError) return void reply(res, REJECTION_STATUS[error.code], error.message);
      log.error('passkey_options_failed', { error: errorName(error) });
      reply(res, 500, PASSKEY_START_FAILED);
    }
  });

  router.post('/auth/passkey/verify', throttle, async (req, res) => {
    const body = passkeyVerifyBody.safeParse(req.body);
    if (!body.success) return void reply(res, 400, PASSKEY_PROOF_NEEDED);
    try {
      const signedIn = await auth.signInWithPasskey(body.data.email, body.data.credential);
      res.json({ success: true, ...signedIn });
    } catch (error) {
      if (error instanceof SignInRejectedError) return void reply(res, REJECTION_STATUS[error.code], error.message);
      log.error('passkey_verification_failed', { error: errorName(error) });
      // The authenticator words its refusals for the person ("challenge expired", "verification failed").
      reply(res, 400, error instanceof Error && error.message ? error.message : PASSKEY_VERIFY_FAILED);
    }
  });

  return router;
}
