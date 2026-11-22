import express from 'express';
import request from 'supertest';
import { appConfigResponse } from '../contracts';
import { createAppConfigRouter } from '../routes/appConfig';
import { createDemoRouter, createDisabledDemoRouter } from '../routes/demo';

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

  it('answers 404 to a guest sign-in and to a guest reset, and issues no session', async () => {
    const signIn = await request(app).post('/api/auth/demo');
    const reset = await request(app).post('/api/auth/demo/reset');

    expect(signIn.status).toBe(404);
    expect(reset.status).toBe(404);
    expect(signIn.body.token).toBeUndefined();
  });

  it('leaves other routes alone', async () => {
    expect((await request(app).post('/api/auth/google')).status).toBe(404);
  });
});

describe('the sneak peek switched on', () => {
  it('still answers a guest sign-in', async () => {
    const app = express();
    app.use('/api', createDemoRouter({ restore: async () => ({ id: 'guest', email: null, avatarUrl: null, country: 'Spain' }), isGuestAccount: async () => true }));
    expect((await request(app).post('/api/auth/demo')).status).toBe(200);
  });
});
