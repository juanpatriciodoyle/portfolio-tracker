// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
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

/** The days a home was lived: where income is counted. */
export interface IncomeHome {
  readonly startDate: CalendarDate;
  /** null means "still living here". */
  readonly endDate: CalendarDate | null;
}

/** Whether the person has already moved out of the home by the as-of day (its last day still counts as living there). */
const isOver = (home: IncomeHome, asOf: CalendarDate) => home.endDate !== null && home.endDate < asOf;

/**
 * The day whose income stands for a home: the as-of day held inside the home's own days, so a home that is over
 * speaks for its last day and one that has not started for its first. The one place this rule lives.
 */
export function incomeReferenceDay(home: IncomeHome, asOf: CalendarDate): CalendarDate {
  if (asOf < home.startDate) return home.startDate;
  return isOver(home, asOf) ? (home.endDate as CalendarDate) : asOf;
}

/**
 * The last day a job pays: its own end date, or the day the home ended when it never had one (a job does not follow
 * a person out of a home that is over). Never later than the home's end. null while it goes on.
 */
export function lastPayDay(line: Pick<IncomeLine, 'endDate'>, home: IncomeHome, asOf: CalendarDate): CalendarDate | null {
  if (!isOver(home, asOf)) return line.endDate;
  const homeEnd = home.endDate as CalendarDate;
  return line.endDate === null || line.endDate > homeEnd ? homeEnd : line.endDate;
}

/** Whether a monthly job is paying on the as-of day: started, and not yet at its last day. A one-time deposit never is. */
export function isPayingNow(line: IncomeLine, home: IncomeHome, asOf: CalendarDate): boolean {
  if (!isMonthly(line) || line.startDate > asOf) return false;
  const last = lastPayDay(line, home, asOf);
  return last === null || last >= asOf;
}

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
