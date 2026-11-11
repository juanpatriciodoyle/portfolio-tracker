import { addDays } from './calendarDate';
import type { CalendarDate } from './vocabulary';

/** What the pure income functions need to know of an income stream (the contract and the domain both fit it). */
export interface IncomeLine {
  readonly label: string;
  readonly amountMinor: number;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate | null;
  /** Absent means it pays every month. */
  readonly kind?: 'MONTHLY' | 'ONE_TIME';
}

export interface IncomeGap {
  readonly from: CalendarDate;
  /** null while the gap goes on (up to today, or the day the home ended). */
  readonly to: CalendarDate | null;
}

const NEVER = '9999-12-31';
const isMonthly = (line: IncomeLine) => line.kind !== 'ONE_TIME';
const isPayingOn = (line: IncomeLine, day: CalendarDate) => isMonthly(line) && line.startDate <= day && day <= (line.endDate ?? NEVER);

/**
 * The stretches of a home where no job paid after one had paid: "No income from X to Y". The time before the
 * first job is not a gap, and a one-time deposit is not a paycheck. Pure: today is an argument.
 */
export function incomeGaps(
  span: { readonly startDate: CalendarDate; readonly endDate: CalendarDate | null; readonly streams: readonly IncomeLine[] },
  asOf: CalendarDate
): IncomeGap[] {
  const lastDay = span.endDate !== null && span.endDate < asOf ? span.endDate : asOf;
  const jobs = span.streams.filter(isMonthly);
  if (lastDay < span.startDate || jobs.length === 0) return [];

  const breaks = new Set<CalendarDate>([span.startDate]);
  for (const { startDate, endDate } of jobs) {
    if (startDate > span.startDate && startDate <= lastDay) breaks.add(startDate);
    if (endDate !== null && addDays(endDate, 1) > span.startDate && addDays(endDate, 1) <= lastDay) breaks.add(addDays(endDate, 1));
  }
  const starts = [...breaks].sort();

  const gaps: { from: CalendarDate; end: CalendarDate }[] = [];
  starts.forEach((start, index) => {
    const end = index + 1 < starts.length ? addDays(starts[index + 1], -1) : lastDay;
    const hasPaidBefore = jobs.some((job) => job.startDate < start);
    if (!hasPaidBefore || jobs.some((job) => isPayingOn(job, start))) return;
    const previous = gaps[gaps.length - 1];
    if (previous && addDays(previous.end, 1) === start) previous.end = end;
    else gaps.push({ from: start, end });
  });
  return gaps.map(({ from, end }) => ({ from, to: end === lastDay ? null : end }));
}

/**
 * The jobs to offer when a new home starts: monthly jobs already started and still paying on its first day. Copies leave the
 * originals alone (a home that ended already bounds its own jobs).
 */
export function jobsToCarry<Line extends IncomeLine>(streams: readonly Line[], newHomeStart: CalendarDate): Line[] {
  return streams.filter((line) => isMonthly(line) && line.startDate <= newHomeStart && (line.endDate === null || line.endDate >= newHomeStart));
}
