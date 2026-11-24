import { z } from 'zod';
import type { CaptchaOutcome, CaptchaVerifier } from '../application/ports';
import { log } from '../lib/logger';

const VERIFY_URL = 'https://api.hcaptcha.com/siteverify';
const VERIFY_TIMEOUT_MS = 3000;

/** The part of `fetch` this adapter uses, so tests can answer without a network. */
export type CaptchaFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** What we rely on in hCaptcha's answer: whether it passed and, if not, why. */
const verifyAnswerSchema = z.object({ success: z.boolean(), 'error-codes': z.array(z.string()).optional() });

/** Reasons that are about OUR settings, not about the visitor's answer: nobody can pass until the owner fixes them. */
const OUR_SETTINGS_WRONG: ReadonlySet<string> = new Set(['missing-input-secret', 'invalid-input-secret', 'sitekey-secret-mismatch']);

/**
 * Checks an hCaptcha answer with hCaptcha's own server (`siteverify`). Fails closed: an outage, an error status or an
 * answer that is not what hCaptcha documents counts as `unavailable`, never as passed.
 */
export class HCaptchaVerifier implements CaptchaVerifier {
  constructor(
    private readonly secret: string,
    private readonly siteKey: string,
    private readonly fetchAnswer: CaptchaFetch = fetch
  ) {}

  async verify(token: string, remoteIp: string | undefined): Promise<CaptchaOutcome> {
    if (token === '') return 'refused';
    const form = new URLSearchParams({ secret: this.secret, response: token, sitekey: this.siteKey });
    if (remoteIp) form.set('remoteip', remoteIp);
    try {
      const response = await this.fetchAnswer(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      if (!response.ok) return unavailable('status');
      const answer = verifyAnswerSchema.safeParse(await response.json());
      if (!answer.success) return unavailable('malformed');
      if (answer.data.success) return 'passed';
      const reasons = answer.data['error-codes'] ?? [];
      return reasons.some((reason) => OUR_SETTINGS_WRONG.has(reason)) ? unavailable(reasons.join(',')) : 'refused';
    } catch (error) {
      return unavailable(error instanceof Error ? error.name : 'unknown');
    }
  }
}

/** The reason is logged by kind only: never the token, never the secret. */
function unavailable(reason: string): CaptchaOutcome {
  log.warn('captcha_unavailable', { reason });
  return 'unavailable';
}
