import type { CaptchaOutcome, CaptchaVerifier } from '../../application/ports';

/** A human check that knows which answers are good, and remembers what it was asked (answers are single-use, as in real life). */
export class FakeCaptcha implements CaptchaVerifier {
  readonly asked: { token: string; remoteIp: string | undefined }[] = [];
  private readonly spent = new Set<string>();

  constructor(private readonly good: readonly string[] = ['good-token'], private readonly outage = false) {}

  async verify(token: string, remoteIp: string | undefined): Promise<CaptchaOutcome> {
    this.asked.push({ token, remoteIp });
    if (this.outage) return 'unavailable';
    if (!this.good.includes(token) || this.spent.has(token)) return 'refused';
    this.spent.add(token);
    return 'passed';
  }
}
