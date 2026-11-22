import { AdminIdentities } from '../application/adminIdentities';
import { ForbiddenError } from '../application/errors';
import type { UsageStatistics } from '../application/ports';
import { UsageAnalyticsService } from '../application/usageAnalyticsService';

const hash = (raw: string) => `hash:${raw}`;
const NOW = new Date('2026-11-22T10:30:00.000Z');

function build({ identityHashes = { 'admin-1': 'hash:boss@example.test' } as Record<string, string>, registered = 8, active = 5 } = {}) {
  const asked: { since?: Date; registeredAsked: number } = { registeredAsked: 0 };
  const statistics: UsageStatistics = {
    countCustomers: async () => (asked.registeredAsked++, registered),
    countCustomersSignedInSince: async (since) => ((asked.since = since), active),
  };
  const service = new UsageAnalyticsService({
    users: { identityHashOf: async (userId) => identityHashes[userId] ?? null },
    admins: new AdminIdentities(['boss@example.test'], hash),
    statistics,
    now: () => NOW,
  });
  return { service, asked };
}

describe('UsageAnalyticsService', () => {
  it('tells the administrator how many customers are registered and how many signed in during the last 3 months', async () => {
    const { service, asked } = build();

    await expect(service.usage({ userId: 'admin-1', admin: true })).resolves.toEqual({
      registered: 8,
      active: 5,
      activePercent: 62.5,
      activeSince: '2026-08-22',
      asOf: '2026-11-22',
    });
    expect(asked.since).toEqual(new Date('2026-08-22T00:00:00.000Z'));
  });

  it('refuses a session that was not signed in as the administrator, and counts nothing', async () => {
    const { service, asked } = build();
    await expect(service.usage({ userId: 'admin-1', admin: false })).rejects.toBeInstanceOf(ForbiddenError);
    expect(asked.registeredAsked).toBe(0);
  });

  it('refuses an admin session whose account is no longer the administrator (the setting changed)', async () => {
    const { service } = build({ identityHashes: { 'admin-1': 'hash:someone-else@example.test' } });
    await expect(service.usage({ userId: 'admin-1', admin: true })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses an account that does not exist', async () => {
    const { service } = build({ identityHashes: {} });
    await expect(service.usage({ userId: 'ghost', admin: true })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
