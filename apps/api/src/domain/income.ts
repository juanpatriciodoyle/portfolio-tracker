import type { CalendarDate } from '../contracts/vocabulary';
import { addDays, AVERAGE_DAYS_PER_MONTH, daysInclusive } from '../contracts/calendarDate';
import { roundHalfAwayFromZero } from './money';

/**
 * One source of income: a job, freelance work, a pension. It pays `amountMinor` every month from `startDate`
 * until `endDate`. Streams add up day by day, so jobs may overlap and a gap between them is simply zero.
 */
export interface IncomeStream {
  readonly label: string;
  /** Net, monthly, in minor units of the living phase's currency. */
  readonly amountMinor: number;
  readonly startDate: CalendarDate;
  /** null means the stream is still paying. */
  readonly endDate: CalendarDate | null;
  /** A one-time deposit (a benefit) is paid on `startDate` only; absent means it pays every month. */
  readonly kind?: 'MONTHLY' | 'ONE_TIME';
  /** Why the job ended: a label for the person, never used in a calculation. */
  readonly endReason?: 'LAID_OFF' | 'QUIT' | 'CONTRACT_FINISHED' | 'OTHER';
}

/** The days a phase was lived, which is where income is counted. */
export interface IncomeSpan {
  readonly startDate: CalendarDate;
  /** null means "still living here". */
  readonly endDate: CalendarDate | null;
}

const NEVER = '9999-12-31';

const isOneTime = (stream: IncomeStream) => stream.kind === 'ONE_TIME';
const isActiveOn = (stream: IncomeStream, day: CalendarDate) => !isOneTime(stream) && stream.startDate <= day && day <= (stream.endDate ?? NEVER);

/** The monthly income on a day: every monthly stream paying that day, added up. A one-time deposit is not a monthly figure. */
export function monthlyIncomeOn(streams: readonly IncomeStream[], day: CalendarDate): number {
  return streams.filter((stream) => isActiveOn(stream, day)).reduce((total, { amountMinor }) => total + amountMinor, 0);
}

/** The last day counted for a phase: the day it ended, or the as-of day while it lasts. */
const lastDayCounted = (span: IncomeSpan, asOf: CalendarDate) => (span.endDate !== null && span.endDate < asOf ? span.endDate : asOf);

/**
 * What was earned from the first day of the phase up to the as-of day (or the day it ended): each stretch of
 * constant income counts for the days it lasted, a day being 1/30.44 of a month (rounded once), plus every one-time
 * deposit paid inside the stay, once.
 */
export function earnedIncomeMinor(span: IncomeSpan & { readonly streams: readonly IncomeStream[] }, asOf: CalendarDate): number {
  const lastDay = lastDayCounted(span, asOf);
  if (lastDay < span.startDate) return 0;

  const monthly = span.streams.filter((stream) => !isOneTime(stream));
  const oneTime = span.streams.filter(isOneTime).filter(({ startDate }) => startDate >= span.startDate && startDate <= lastDay);
  const deposited = oneTime.reduce((total, { amountMinor }) => total + amountMinor, 0);

  const breaks = new Set<CalendarDate>([span.startDate]);
  for (const { startDate, endDate } of monthly) {
    if (startDate > span.startDate && startDate <= lastDay) breaks.add(startDate);
    if (endDate !== null && addDays(endDate, 1) > span.startDate && addDays(endDate, 1) <= lastDay) breaks.add(addDays(endDate, 1));
  }
  const starts = [...breaks].sort();

  const monthFractions = starts.reduce((total, start, index) => {
    const end = index + 1 < starts.length ? addDays(starts[index + 1], -1) : lastDay;
    return total + monthlyIncomeOn(monthly, start) * daysInclusive(start, end);
  }, 0);
  return roundHalfAwayFromZero(monthFractions / AVERAGE_DAYS_PER_MONTH) + deposited;
}

/** What was earned in an average month of the stay: the total over the months lived, gaps included. 0 before the phase starts. */
export function averageMonthlyIncomeMinor(span: IncomeSpan & { readonly streams: readonly IncomeStream[] }, asOf: CalendarDate): number {
  const lastDay = lastDayCounted(span, asOf);
  if (lastDay < span.startDate) return 0;
  const months = daysInclusive(span.startDate, lastDay) / AVERAGE_DAYS_PER_MONTH;
  return roundHalfAwayFromZero(earnedIncomeMinor(span, asOf) / months);
}

/**
 * Phases saved before income streams existed held one base income and changes that replaced it for a while.
 * This rewrites them as streams that pay exactly the same on every day, so nothing already saved moves.
 */
export interface LegacyIncome extends IncomeSpan {
  readonly baseMinor: number;
  readonly changes: readonly { startDate: CalendarDate; endDate: CalendarDate | null; amountMinor: number }[];
}

const LEGACY_LABEL = 'Income';

export function streamsFromLegacyIncome(legacy: LegacyIncome): IncomeStream[] {
  const changeOn = (day: CalendarDate) =>
    legacy.changes
      .filter((change) => change.startDate <= day && day <= (change.endDate ?? NEVER))
      .reduce<(typeof legacy.changes)[number] | undefined>((latest, change) => (latest === undefined || change.startDate > latest.startDate ? change : latest), undefined);
  const amountOn = (day: CalendarDate) => changeOn(day)?.amountMinor ?? legacy.baseMinor;

  const breaks = new Set<CalendarDate>([legacy.startDate]);
  for (const { startDate, endDate } of legacy.changes) {
    if (startDate > legacy.startDate) breaks.add(startDate);
    if (endDate !== null && addDays(endDate, 1) > legacy.startDate) breaks.add(addDays(endDate, 1));
  }
  const starts = [...breaks].sort();

  const segments = starts.map((start, index) => ({
    startDate: start,
    endDate: index + 1 < starts.length ? addDays(starts[index + 1], -1) : null,
    amountMinor: amountOn(start),
  }));

  // Neighbouring stretches paying the same amount are one stream; a stretch paying nothing is a gap.
  const merged = segments.reduce<typeof segments>((all, segment) => {
    const previous = all[all.length - 1];
    if (previous && previous.amountMinor === segment.amountMinor) return [...all.slice(0, -1), { ...previous, endDate: segment.endDate }];
    return [...all, segment];
  }, []);
  return merged.filter(({ amountMinor }) => amountMinor > 0).map((segment) => ({ label: LEGACY_LABEL, ...segment }));
}
