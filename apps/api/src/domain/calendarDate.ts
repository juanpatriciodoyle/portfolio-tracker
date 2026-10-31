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

/** A calendar month as 'YYYY-MM'. */
export type CalendarMonth = string;

export const monthOf = (date: CalendarDate): CalendarMonth => date.slice(0, 7);

export function previousMonth(month: CalendarMonth): CalendarMonth {
  const [year, number] = month.split('-').map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

export function nextMonth(month: CalendarMonth): CalendarMonth {
  const [year, number] = month.split('-').map(Number);
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
}

/** The `count` months up to and including `month`, oldest first. */
export function monthsEndingAt(month: CalendarMonth, count: number): CalendarMonth[] {
  const months = [month];
  for (let index = 1; index < count; index++) months.unshift(previousMonth(months[0]));
  return months;
}

export function daysInMonth(month: CalendarMonth): number {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

export const firstDayOf = (month: CalendarMonth): CalendarDate => `${month}-01`;
export const lastDayOf = (month: CalendarMonth): CalendarDate => `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return calendarDateOf(new Date((epochDay(date) + days) * MS_PER_DAY));
}

/** The UTC calendar day an instant falls on. The imperative shell uses this to turn "now" into a CalendarDate. */
export function calendarDateOf(instant: Date): CalendarDate {
  return instant.toISOString().slice(0, 10);
}
