import type { CalendarDate } from '../contracts/vocabulary';

/** The same 30.44-day average month the inflation maths uses. */
export const AVERAGE_DAYS_PER_MONTH = 30.44;

const MS_PER_DAY = 86_400_000;

/** Whole days since 1970-01-01. Calendar dates carry no time of day or time zone, so this is exact. */
export function epochDay(date: CalendarDate): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/** Days from `start` to `end`, counting both ends; 0 when `end` comes before `start`. */
export function daysInclusive(start: CalendarDate, end: CalendarDate): number {
  return Math.max(0, epochDay(end) - epochDay(start) + 1);
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** The UTC calendar day an instant falls on. The imperative shell uses this to turn "now" into a CalendarDate. */
export function calendarDateOf(instant: Date): CalendarDate {
  return instant.toISOString().slice(0, 10);
}
