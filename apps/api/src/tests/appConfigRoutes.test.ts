import express from 'express';
import request from 'supertest';
import { GuestService } from '../application/guestService';
import { SlidingWindowRateLimiter } from '../application/limits';
import { appConfigResponse } from '../contracts';
import { generateToken } from '../lib/auth';
import { createAppConfigRouter } from '../routes/appConfig';
import { createDemoRouter, createDisabledDemoRouter } from '../routes/demo';
import { InMemoryGuestAccounts } from './support/inMemoryGuestAccounts';

describe('GET /api/config', () => {
  const appWith = (demoEnabled: boolean) => {
    const app = express();
    app.use('/api', createAppConfigRouter({ demoEnabled }));
    return app;
  };

  it.each([true, false])('tells the web app whether the sneak peek exists (%s), in the shape of the contract', async (demoEnabled) => {
    const response = await request(appWith(demoEnabled)).get('/api/config');

    expect(response.status).toBe(200);
    expect(appConfigResponse.parse(response.body)).toEqual({ demoEnabled });
  });

  it('is public: it needs no sign-in, and says nothing else', async () => {
    const response = await request(appWith(true)).get('/api/config');
    expect(Object.keys(response.body)).toEqual(['demoEnabled']);
  });
});

describe('the sneak peek switched off', () => {
  const app = express();
  app.use('/api', createDisabledDemoRouter());

  it('answers 404 to a guest sign-in and to ending a guest session, and issues no session', async () => {
    const signIn = await request(app).post('/api/auth/demo');
    const end = await request(app).post('/api/auth/demo/end');

    expect(signIn.status).toBe(404);
    expect(end.status).toBe(404);
    expect(signIn.body.token).toBeUndefined();
  });

  it('leaves other routes alone', async () => {
    expect((await request(app).post('/api/auth/google')).status).toBe(404);
  });
});

describe('the demo switched on', () => {
  it('still answers a guest sign-in', async () => {
    const guests = new GuestService({
      accounts: new InMemoryGuestAccounts(),
      seeder: { seed: async () => undefined },
      issueToken: generateToken,
      now: () => new Date('2026-11-23T10:00:00.000Z'),
    });
    const app = express();
    app.use('/api', createDemoRouter(guests, { limiter: new SlidingWindowRateLimiter({ limit: 10, windowMs: 60_000, now: () => 0 }) }));
    expect((await request(app).post('/api/auth/demo')).status).toBe(200);
  });
});
