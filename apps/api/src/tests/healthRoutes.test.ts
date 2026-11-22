import express from 'express';
import request from 'supertest';
import { createHealthRouter } from '../routes/health';

function appWith(checkDatabase: () => Promise<void>, timeoutMs = 50) {
  const app = express();
  app.use('/api', createHealthRouter({ checkDatabase, timeoutMs }));
  return app;
}

describe('GET /api/health', () => {
  it('says the process is up without touching the database', async () => {
    const check = jest.fn().mockResolvedValue(undefined);
    const response = await request(appWith(check)).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(check).not.toHaveBeenCalled();
  });
});

describe('GET /api/ready', () => {
  it('is ready when the database answers', async () => {
    const response = await request(appWith(async () => undefined)).get('/api/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
  });

  it('is 503 when the database fails, saying nothing about why', async () => {
    const response = await request(appWith(async () => { throw new Error('password authentication failed for user "app"'); })).get('/api/ready');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
  });

  it('is 503 when the database does not answer in time', async () => {
    const response = await request(appWith(() => new Promise<void>(() => undefined), 20)).get('/api/ready');
    expect(response.status).toBe(503);
  });

  it('never lets a proxy keep the answer', async () => {
    const response = await request(appWith(async () => undefined)).get('/api/ready');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
