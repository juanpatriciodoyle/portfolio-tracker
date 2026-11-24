import type { NextFunction, Request, Response } from 'express';
import { captchaBodySchema } from '../contracts';
import type { CaptchaVerifier } from '../application/ports';
import { refuse } from './auth';

/**
 * The human check in front of Google sign-in (the one way an account is created; the demo is never checked). With no verifier (not configured) it does nothing.
 * With one, the request must carry a `captchaToken` hCaptcha confirms: missing, wrong, used before or a check we
 * cannot make all refuse, and nothing behind it runs. It sits after the rate limit, so a flood is limited first.
 */
export function captchaGate(verifier: CaptchaVerifier | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (verifier === null) return next();
    const body = captchaBodySchema.safeParse(req.body ?? {});
    const token = body.success ? body.data.captchaToken : undefined;
    if (token === undefined) return refuse(res, 'CAPTCHA_FAILED');
    const outcome = await verifier.verify(token, req.ip);
    if (outcome === 'passed') return next();
    refuse(res, outcome === 'refused' ? 'CAPTCHA_FAILED' : 'CAPTCHA_UNAVAILABLE');
  };
}
