import { ACTIVE_CUSTOMER_MONTHS, type UsageAnalyticsResponse } from '../contracts';
import { activeWindowStart, usageSummary } from '../domain/usageAnalytics';
import { ForbiddenError } from './errors';
import type { AdminDirectory, UsageStatistics, UserRepository } from './ports';

export interface UsageAnalyticsServiceDeps {
  readonly users: Pick<UserRepository, 'identityHashOf'>;
  readonly admins: AdminDirectory;
  readonly statistics: UsageStatistics;
  readonly now: () => Date;
}

/** The session asking: who it is and whether it was signed in as the administrator. */
export interface AdminSession {
  readonly userId: string;
  readonly admin: boolean;
}

/** Query: how many customers use the app. Two checks, so changing the setting takes effect without waiting for sessions to expire. */
export class UsageAnalyticsService {
  constructor(private readonly deps: UsageAnalyticsServiceDeps) {}

  async usage(session: AdminSession): Promise<UsageAnalyticsResponse> {
    await this.requireAdmin(session);

    const asOf = this.deps.now();
    const windowStart = activeWindowStart(asOf, ACTIVE_CUSTOMER_MONTHS);
    const [registered, active] = await Promise.all([
      this.deps.statistics.countCustomers(),
      this.deps.statistics.countCustomersSignedInSince(windowStart),
    ]);
    return usageSummary({ registered, active, asOf, windowStart });
  }

  private async requireAdmin({ userId, admin }: AdminSession): Promise<void> {
    if (!admin) throw new ForbiddenError();
    const userHash = await this.deps.users.identityHashOf(userId);
    if (userHash === null || !this.deps.admins.isAdmin(userHash)) throw new ForbiddenError();
  }
}
