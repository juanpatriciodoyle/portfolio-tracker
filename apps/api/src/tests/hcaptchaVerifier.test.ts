import { HCaptchaVerifier, type CaptchaFetch } from '../infrastructure/hcaptchaVerifier';

const SECRET = '0x0000000000000000000000000000000000000000';
const SITEKEY = '10000000-ffff-ffff-ffff-000000000001';

function build(answer: { ok?: boolean; body?: unknown; fail?: Error } = { body: { success: true } }) {
  const calls: { url: string; init: Parameters<CaptchaFetch>[1] }[] = [];
  const fetchAnswer: CaptchaFetch = async (url, init) => {
    calls.push({ url, init });
    if (answer.fail) throw answer.fail;
    return { ok: answer.ok ?? true, json: async () => answer.body };
  };
  return { verifier: new HCaptchaVerifier(SECRET, SITEKEY, fetchAnswer), calls };
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('HCaptchaVerifier', () => {
  it('asks hCaptcha with the secret, the answer, the address and the site key, as a form', async () => {
    const { verifier, calls } = build();

    await verifier.verify('token-1', '203.0.113.9');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.hcaptcha.com/siteverify');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(calls[0].init.body);
    expect(Object.fromEntries(form)).toEqual({ secret: SECRET, response: 'token-1', remoteip: '203.0.113.9', sitekey: SITEKEY });
    expect(calls[0].init.signal).toBeDefined();
  });

  it('leaves the address out when there is none', async () => {
    const { verifier, calls } = build();
    await verifier.verify('token-1', undefined);
    expect(new URLSearchParams(calls[0].init.body).has('remoteip')).toBe(false);
  });

  it('passes when hCaptcha says success', async () => {
    expect(await build({ body: { success: true, hostname: 'localhost' } }).verifier.verify('t', '1.1.1.1')).toBe('passed');
  });

  it.each([['missing-input-response'], ['invalid-input-response'], ['invalid-or-already-seen-response'], ['expired-input-response']])(
    'refuses a token hCaptcha rejects (%s)',
    async (code) => {
      expect(await build({ body: { success: false, 'error-codes': [code] } }).verifier.verify('t', '1.1.1.1')).toBe('refused');
    }
  );

  it('refuses a failure with no reason given', async () => {
    expect(await build({ body: { success: false } }).verifier.verify('t', undefined)).toBe('refused');
  });

  it.each([['missing-input-secret'], ['invalid-input-secret'], ['sitekey-secret-mismatch']])(
    'reports it cannot tell when OUR settings are wrong (%s)',
    async (code) => {
      expect(await build({ body: { success: false, 'error-codes': [code] } }).verifier.verify('t', undefined)).toBe('unavailable');
    }
  );

  it('cannot tell when hCaptcha is down, answers an error status, times out or answers nonsense, and never lets anyone through', async () => {
    for (const setup of [
      { fail: new TypeError('fetch failed') },
      { fail: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) },
      { ok: false, body: { success: true } },
      { body: 'not an object' },
      { body: { nothing: 1 } },
      { body: { success: 'yes' } },
    ]) {
      expect(await build(setup).verifier.verify('t', '1.1.1.1')).toBe('unavailable');
    }
  });

  it('never asks for an empty answer', async () => {
    const { verifier, calls } = build();
    expect(await verifier.verify('', '1.1.1.1')).toBe('refused');
    expect(calls).toHaveLength(0);
  });
});
