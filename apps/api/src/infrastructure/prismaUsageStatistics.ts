import type { PrismaClient } from '@prisma/client';
import type { UsageStatistics } from '../application/ports';
import { DEMO_USER_EMAIL } from '../domain/demoAccount';

/**
 * Customers are the accounts other than the demo guest. Real accounts store no email, so the guest is left out
 * with an explicit "no email or a different one": a plain `not` would also drop every account whose email is null.
 */
const customers = { OR: [{ email: null }, { email: { not: DEMO_USER_EMAIL } }] };

export class PrismaUsageStatistics implements UsageStatistics {
  constructor(private readonly db: PrismaClient) {}

  countCustomers(): Promise<number> {
    return this.db.user.count({ where: customers });
  }

  countCustomersSignedInSince(since: Date): Promise<number> {
    return this.db.user.count({ where: { AND: [customers, { lastLoginAt: { gte: since } }] } });
  }
}
