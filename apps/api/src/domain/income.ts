import type { CalendarDate, IncomeReason } from '../contracts/vocabulary';
import { addDays, AVERAGE_DAYS_PER_MONTH, daysInclusive } from '../contracts/calendarDate';
import { roundHalfAwayFromZero } from './money';

/** From a day on, the monthly income is something else: a promotion, a new job, a stretch without work (0). */
export interface IncomeChange {
  readonly startDate: CalendarDate;
  /** null means the change lasts until a later change replaces it, or the phase ends. */
  readonly endDate: CalendarDate | null;
  /** Monthly, in minor units of the living phase's currency. */
  readonly amountMinor: number;
  readonly reason: IncomeReason | null;
}

export interface IncomeHistory {
  /** What was earned each month before any change, and whenever no change applies. */
  readonly baseMinor: number;
  readonly changes: readonly IncomeChange[];
}

const NEVER = '9999-12-31';

/** The change in force on a day: of the ranges covering it, the one that started last. */
function changeOn(changes: readonly IncomeChange[], day: CalendarDate): IncomeChange | undefined {
  return changes
    .filter((change) => change.startDate <= day && day <= (change.endDate ?? NEVER))
    .reduce<IncomeChange | undefined>((latest, change) => (latest === undefined || change.startDate > latest.startDate ? change : latest), undefined);
}

/** The monthly income in force on a day. */
export function activeIncomeMinor(history: IncomeHistory, day: CalendarDate): number {
  return changeOn(history.changes, day)?.amountMinor ?? history.baseMinor;
}

/**
 * What was earned from the first day of the phase up to the as-of day (or the day it ended): each stretch of
 * income counts for the days it lasted, a day being 1/30.44 of a month. Rounded once, at the end.
 */
export function earnedIncomeMinor(
  history: IncomeHistory & { readonly startDate: CalendarDate; readonly endDate: CalendarDate | null },
  asOf: CalendarDate
): number {
  const lastDay = history.endDate !== null && history.endDate < asOf ? history.endDate : asOf;
  if (lastDay < history.startDate) return 0;

  const breaks = new Set<CalendarDate>([history.startDate]);
  for (const { startDate, endDate } of history.changes) {
    if (startDate > history.startDate && startDate <= lastDay) breaks.add(startDate);
    if (endDate !== null && addDays(endDate, 1) > history.startDate && addDays(endDate, 1) <= lastDay) breaks.add(addDays(endDate, 1));
  }
  const starts = [...breaks].sort();

  const monthFractions = starts.reduce((total, start, index) => {
    const end = index + 1 < starts.length ? addDays(starts[index + 1], -1) : lastDay;
    return total + activeIncomeMinor(history, start) * daysInclusive(start, end);
  }, 0);
  return roundHalfAwayFromZero(monthFractions / AVERAGE_DAYS_PER_MONTH);
}
