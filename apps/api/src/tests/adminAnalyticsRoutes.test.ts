import express from 'express';
import request from 'supertest';
import { AdminIdentities } from '../application/adminIdentities';
import { UsageAnalyticsService } from '../application/usageAnalyticsService';
import { usageAnalyticsResponse } from '../contracts';
import { generateToken } from '../lib/auth';
import { createAdminAnalyticsRouter } from '../routes/adminAnalytics';

const hash = (raw: string) => `hash:${raw}`;

function buildApp() {
  const service = new UsageAnalyticsService({
    users: { identityHashOf: async (id) => ({ 'admin-1': 'hash:boss@example.test', 'user-1': 'hash:ana@example.test' })[id] ?? null },
    admins: new AdminIdentities(['boss@example.test'], hash),
    statistics: { countCustomers: async () => 8, countCustomersSignedInSince: async () => 5 },
    now: () => new Date('2026-11-22T10:30:00.000Z'),
  });
  const app = express();
  app.use('/api', createAdminAnalyticsRouter(service));
  return app;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('GET /api/admin/analytics', () => {
  it('answers the administrator with the usage figures, in the shape of the contract, and tells caches to keep nothing', async () => {
    const response = await request(buildApp()).get('/api/admin/analytics').set(bearer(generateToken('admin-1', { admin: true })));

    expect(response.status).toBe(200);
    expect(usageAnalyticsResponse.parse(response.body)).toEqual({
      registered: 8,
      active: 5,
      activePercent: 62.5,
      activeSince: '2026-08-22',
      asOf: '2026-11-22',
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('answers 401 when signed out', async () => {
    expect((await request(buildApp()).get('/api/admin/analytics')).status).toBe(401);
  });

  it('answers 403 to any other customer, with a plain message and no figures', async () => {
    const response = await request(buildApp()).get('/api/admin/analytics').set(bearer(generateToken('user-1')));
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Only the administrator can see this.' });
  });

  it('answers 403 when the session claims admin but the account is not the administrator', async () => {
    const response = await request(buildApp()).get('/api/admin/analytics').set(bearer(generateToken('user-1', { admin: true })));
    expect(response.status).toBe(403);
  });

  it('does not accept a token in the URL', async () => {
    const response = await request(buildApp()).get(`/api/admin/analytics?token=${generateToken('admin-1', { admin: true })}`);
    expect(response.status).toBe(401);
  });
});
