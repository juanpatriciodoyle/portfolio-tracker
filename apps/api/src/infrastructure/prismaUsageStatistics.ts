import type { PrismaClient } from '@prisma/client';
import type { UsageStatistics } from '../application/ports';

/** Customers are the accounts other than the demo guests, which exist for an hour and belong to nobody. */
const customers = { isGuest: false };

export class PrismaUsageStatistics implements UsageStatistics {
  constructor(private readonly db: PrismaClient) {}

  countCustomers(): Promise<number> {
    return this.db.user.count({ where: customers });
  }

  countCustomersSignedInSince(since: Date): Promise<number> {
    return this.db.user.count({ where: { AND: [customers, { lastLoginAt: { gte: since } }] } });
  }
}
