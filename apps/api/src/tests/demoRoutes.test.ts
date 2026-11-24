import express from 'express';
import request from 'supertest';
import { GuestService } from '../application/guestService';
import { SlidingWindowRateLimiter } from '../application/limits';
import { generateToken, verifyToken } from '../lib/auth';
import { createDemoRouter, createDisabledDemoRouter } from '../routes/demo';
import { FakeCaptcha } from './support/fakeCaptcha';
import { InMemoryGuestAccounts } from './support/inMemoryGuestAccounts';

function build({ attemptsAllowed = 1000, seed = async () => undefined, captcha }: { attemptsAllowed?: number; seed?: () => Promise<void>; captcha?: FakeCaptcha } = {}) {
  const accounts = new InMemoryGuestAccounts();
  const seeded: string[] = [];
  const guests = new GuestService({
    accounts,
    seeder: { seed: async (userId) => (seeded.push(userId), seed()) },
    issueToken: generateToken,
    now: () => new Date('2026-11-23T10:00:00.000Z'),
  });
  const app = express();
  app.use(express.json());
  app.use('/api', createDemoRouter(guests, { limiter: new SlidingWindowRateLimiter({ limit: attemptsAllowed, windowMs: 600_000, now: () => 0 }), captcha }));
  return { app, accounts, seeded };
}

const bearer = (token: string) => `Bearer ${token}`;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('"Try the demo"', () => {
  it('starts every visit in an account of its own, seeded, with a one-hour guest session', async () => {
    const { app, seeded } = build();

    const first = await request(app).post('/api/auth/demo');
    const second = await request(app).post('/api/auth/demo');

    expect(first.status).toBe(200);
    expect(first.body.user).toMatchObject({ name: 'Joe', isGuest: true, isAdmin: false, hasPasskey: false });
    expect(second.body.user.id).not.toBe(first.body.user.id);
    expect(seeded).toEqual([first.body.user.id, second.body.user.id]);
    expect(verifyToken(first.body.token)).toEqual({ userId: first.body.user.id, admin: false, guest: true });
  });

  it('answers 500 DEMO_UNAVAILABLE, and leaves no account behind, when the demo cannot be prepared', async () => {
    const { app, accounts } = build({
      seed: async () => {
        throw new Error('db down');
      },
    });

    const response = await request(app).post('/api/auth/demo');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: 'DEMO_UNAVAILABLE' });
    expect(accounts.size).toBe(0);
  });

  it('shares the sign-in limit, so the demo cannot be used to fill the database', async () => {
    const { app, accounts } = build({ attemptsAllowed: 2 });

    await request(app).post('/api/auth/demo');
    await request(app).post('/api/auth/demo');
    const limited = await request(app).post('/api/auth/demo');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(accounts.size).toBe(2);
  });
});

describe('leaving the demo', () => {
  it('erases the guest’s account when the guest signs out', async () => {
    const { app, accounts } = build();
    const { body } = await request(app).post('/api/auth/demo');

    const response = await request(app).post('/api/auth/demo/end').set('Authorization', bearer(body.token));

    expect(response.status).toBe(204);
    expect(accounts.has(body.user.id)).toBe(false);
  });

  it('refuses to erase a real account, and says why', async () => {
    const { app, accounts } = build();
    accounts.addRealAccount('user-alice');

    const response = await request(app).post('/api/auth/demo/end').set('Authorization', bearer(generateToken('user-alice')));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'NOT_A_GUEST' });
    expect(accounts.has('user-alice')).toBe(true);
  });

  it('refuses a request without a session', async () => {
    const { app } = build();
    expect((await request(app).post('/api/auth/demo/end')).status).toBe(401);
  });
});

describe('with the demo switched off', () => {
  it('has no demo addresses at all', async () => {
    const app = express();
    app.use('/api', createDisabledDemoRouter());

    expect((await request(app).post('/api/auth/demo')).status).toBe(404);
    expect((await request(app).post('/api/auth/demo/end')).status).toBe(404);
  });
});

describe('"Try the demo" with the human check on', () => {
  it('creates no account without an answer, with a forged one, or with one already used', async () => {
    const { app, accounts, seeded } = build({ captcha: new FakeCaptcha() });

    const missing = await request(app).post('/api/auth/demo').send({});
    const forged = await request(app).post('/api/auth/demo').send({ captchaToken: 'forged' });
    const first = await request(app).post('/api/auth/demo').send({ captchaToken: 'good-token' });
    const reused = await request(app).post('/api/auth/demo').send({ captchaToken: 'good-token' });

    expect([missing.status, forged.status, first.status, reused.status]).toEqual([400, 400, 200, 400]);
    expect([missing.body.code, forged.body.code, reused.body.code]).toEqual(['CAPTCHA_FAILED', 'CAPTCHA_FAILED', 'CAPTCHA_FAILED']);
    expect(seeded).toHaveLength(1);
    expect(accounts).toBeDefined();
  });

  it('answers 503 CAPTCHA_UNAVAILABLE when the check cannot be made, and creates no account', async () => {
    const { app, seeded } = build({ captcha: new FakeCaptcha([], true) });

    const response = await request(app).post('/api/auth/demo').send({ captchaToken: 'good-token' });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('CAPTCHA_UNAVAILABLE');
    expect(seeded).toHaveLength(0);
  });

  it('keeps the rate limit first, so a flood is never sent on to the check service', async () => {
    const captcha = new FakeCaptcha(['a', 'b']);
    const { app } = build({ captcha, attemptsAllowed: 1 });

    await request(app).post('/api/auth/demo').send({ captchaToken: 'a' });
    const limited = await request(app).post('/api/auth/demo').send({ captchaToken: 'b' });

    expect(limited.status).toBe(429);
    expect(captcha.asked).toHaveLength(1);
  });

  it('does not guard ending a guest session, which creates nothing', async () => {
    const { app } = build({ captcha: new FakeCaptcha() });
    expect((await request(app).post('/api/auth/demo/end')).status).toBe(401);
  });
});
