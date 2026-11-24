import { Router } from 'express';
import type { GuestService } from '../application/guestService';
import { SignInRejectedError } from '../application/errors';
import type { SlidingWindowRateLimiter } from '../application/limits';
import type { CaptchaVerifier } from '../application/ports';
import type { ApiErrorResponse } from '../contracts';
import { errorName, log } from '../lib/logger';
import { createThrottle, refuse } from './auth';
import { captchaGate } from './captcha';
import { requireUser, respondWithError, userIdOf } from './http';

export interface DemoRouterOptions {
  /** The same allowance per address as every other way of signing in. */
  readonly limiter: SlidingWindowRateLimiter;
  /** The human check before an account is created; absent when the server does not ask for one. */
  readonly captcha?: CaptchaVerifier;
}

export function createDemoRouter(guests: GuestService, { limiter, captcha }: DemoRouterOptions): Router {
  const router = Router();

  // Every visit starts in an account of its own, so nobody ever sees or changes what another visitor did.
  router.post('/auth/demo', createThrottle(limiter), captchaGate(captcha ?? null), async (_req, res) => {
    try {
      res.status(200).json({ success: true, ...(await guests.begin()) });
    } catch (error) {
      if (error instanceof SignInRejectedError) return refuse(res, error.code);
      log.error('guest_sign_in_failed', { error: errorName(error) });
      refuse(res, 'DEMO_UNAVAILABLE');
    }
  });

  // Called when a guest signs out: the account and everything in it goes now, not at the end of the hour.
  router.post('/auth/demo/end', requireUser, async (req, res) => {
    try {
      await guests.end(userIdOf(req));
      res.status(204).end();
    } catch (error) {
      if (error instanceof SignInRejectedError) return refuse(res, error.code);
      respondWithError(error, res);
    }
  });

  return router;
}

/** With the demo switched off, its addresses do not exist: no guest session can be asked for. */
export function createDisabledDemoRouter(): Router {
  const router = Router();
  router.use('/auth/demo', (_req, res) => {
    res.status(404).json({ error: 'Not found.' } satisfies ApiErrorResponse);
  });
  return router;
}
