import { periodStartDate, type ReportingPeriod } from '../data/sampleChartData';

/** The windows in the order they are offered. `All` needs no history: it is the whole of it. */
const OFFERED: readonly ReportingPeriod[] = ['All', '1Y', 'YTD', '3M', '1M', 'Custom'];

/** "YYYY-MM-DD" in the person's own calendar: the day a window starts on. */
const calendarDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Readings are dated by the UTC day they were taken on, so "is there an earlier reading than today's" is asked in UTC. */
const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The windows that are true. A window reaching back to a day nobody measured would be an invention, so it is offered only
 * when real readings begin on or before the day it starts. A custom range needs at least two real days to choose from:
 * one earlier than today's.
 * Pure: today is an argument.
 */
export function availablePeriods(realFrom: string | null, today: Date): ReportingPeriod[] {
  return OFFERED.filter((period) => {
    if (period === 'All') return true;
    if (realFrom === null) return false;
    if (period === 'Custom') return realFrom < utcDay(today);
    const start = periodStartDate(period, today);
    return start !== null && realFrom <= calendarDay(start);
  });
}
