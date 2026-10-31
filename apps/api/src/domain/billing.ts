import type { BillingCadence, CalendarDate, FixedCostCategory } from '../contracts/vocabulary';
import { daysInclusive, firstDayOf, lastDayOf, monthOf, nextMonth, type CalendarMonth } from './calendarDate';
import { InvalidBillingRecordError } from './errors';

/** A bill actually received: what it cost and which days it covers (both ends included). */
export interface BillingRecord {
  readonly id: string;
  readonly phaseId: string;
  readonly category: FixedCostCategory;
  readonly cadence: BillingCadence;
  readonly periodStart: CalendarDate;
  readonly periodEnd: CalendarDate;
  /** In minor units of the living phase's currency. */
  readonly amountMinor: number;
}

/** Longest period one bill may cover: an annual bill plus generous slack. */
const MAX_PERIOD_DAYS = 800;

export function createBillingRecord(input: BillingRecord): BillingRecord {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new InvalidBillingRecordError('A bill must be a whole, non-negative amount of minor units');
  }
  if (input.periodEnd < input.periodStart) {
    throw new InvalidBillingRecordError('A bill period cannot end before it starts');
  }
  if (daysInclusive(input.periodStart, input.periodEnd) > MAX_PERIOD_DAYS) {
    throw new InvalidBillingRecordError('A bill cannot cover more than two years');
  }
  return { ...input };
}

/**
 * Shares a bill out over the calendar months it covers, in proportion to the days in each.
 * Whole units are left over after the proportional split; they go to the months with the largest
 * remainders (earlier month on a tie), so the parts always add up to the bill exactly.
 * Every month of the period appears in the result, even for a zero bill: it marks the month as covered.
 */
export function allocateToMonths(record: BillingRecord): Record<CalendarMonth, number> {
  const totalDays = daysInclusive(record.periodStart, record.periodEnd);
  const lastMonth = monthOf(record.periodEnd);

  const shares: { month: CalendarMonth; floor: number; remainder: number }[] = [];
  for (let month = monthOf(record.periodStart); ; month = nextMonth(month)) {
    const first = record.periodStart > firstDayOf(month) ? record.periodStart : firstDayOf(month);
    const last = record.periodEnd < lastDayOf(month) ? record.periodEnd : lastDayOf(month);
    const proportional = record.amountMinor * daysInclusive(first, last);
    shares.push({ month, floor: Math.floor(proportional / totalDays), remainder: proportional % totalDays });
    if (month === lastMonth) break;
  }

  const leftover = record.amountMinor - shares.reduce((sum, share) => sum + share.floor, 0);
  const byLargestRemainder = shares.map((share, order) => ({ share, order })).sort((a, b) => b.share.remainder - a.share.remainder || a.order - b.order);
  const extra = new Set(byLargestRemainder.slice(0, leftover).map(({ share }) => share.month));

  return Object.fromEntries(shares.map(({ month, floor }) => [month, floor + (extra.has(month) ? 1 : 0)]));
}
