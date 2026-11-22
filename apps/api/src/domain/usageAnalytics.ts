import type { UsageAnalyticsResponse } from '../contracts';

const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** The first moment that counts as recent: `months` calendar months before `asOf`, at the start of that day (UTC). */
export function activeWindowStart(asOf: Date, months: number): Date {
  const target = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(asOf.getUTCDate(), lastDay));
  return startOfUtcDay(target);
}

interface UsageCounts {
  readonly registered: number;
  readonly active: number;
  readonly asOf: Date;
  readonly windowStart: Date;
}

/** The figures the administrator reads. Active can never exceed registered, even if someone signed up between the two counts. */
export function usageSummary({ registered, active, asOf, windowStart }: UsageCounts): UsageAnalyticsResponse {
  const activeCustomers = Math.min(active, registered);
  return {
    registered,
    active: activeCustomers,
    activePercent: registered === 0 ? 0 : Math.round((activeCustomers / registered) * 1000) / 10,
    activeSince: isoDay(windowStart),
    asOf: isoDay(asOf),
  };
}
