import express from 'express';
import request from 'supertest';
import { generateToken } from '../lib/auth';
import { guestGate } from '../routes/guestGate';

function build(isLive: (userId: string) => Promise<boolean>) {
  const asked: string[] = [];
  const app = express();
  app.use('/api', guestGate(async (userId) => (asked.push(userId), isLive(userId))));
  app.get('/api/anything', (_req, res) => void res.json({ ok: true }));
  return { app, asked };
}

describe('the guest gate', () => {
  it('lets a guest whose hour is not over through', async () => {
    const { app } = build(async () => true);
    const response = await request(app).get('/api/anything').set('Authorization', `Bearer ${generateToken('guest-1', { guest: true })}`);
    expect(response.status).toBe(200);
  });

  it('answers 401 GUEST_SESSION_ENDED for a guest whose account is gone or expired', async () => {
    const { app } = build(async () => false);

    const response = await request(app).get('/api/anything').set('Authorization', `Bearer ${generateToken('guest-1', { guest: true })}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'GUEST_SESSION_ENDED' });
  });

  it('does not ask about real accounts, with or without a session', async () => {
    const { app, asked } = build(async () => false);

    expect((await request(app).get('/api/anything').set('Authorization', `Bearer ${generateToken('user-1')}`)).status).toBe(200);
    expect((await request(app).get('/api/anything')).status).toBe(200);
    expect((await request(app).get('/api/anything').set('Authorization', 'Bearer not-a-token')).status).toBe(200);
    expect(asked).toEqual([]);
  });

  it('hands a failure of the check to the error handler instead of letting a guest through', async () => {
    const { app } = build(async () => {
      throw new Error('db down');
    });

    const response = await request(app).get('/api/anything').set('Authorization', `Bearer ${generateToken('guest-1', { guest: true })}`);

    expect(response.status).toBe(500);
  });
});
