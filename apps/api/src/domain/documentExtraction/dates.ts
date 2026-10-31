import type { CalendarDate } from '../../contracts/vocabulary';
import { daysInclusive } from '../calendarDate';
import { cleanLines, fold } from './text';

/** Which number comes first in "03/04/2026". `null` when the country is unknown: ambiguous dates are then skipped. */
export type DateOrder = 'DMY' | 'MDY' | null;

export interface DateMention {
  readonly date: CalendarDate;
}

const MONTHS: Readonly<Record<string, number>> = {
  // English
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
  // Spanish
  enero: 1, ene: 1, febrero: 2, marzo: 3, abril: 4, abr: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, ago: 8, septiembre: 9,
  setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12, dic: 12,
  // Portuguese
  janeiro: 1, fevereiro: 2, fev: 2, marco: 3, maio: 5, mai: 5, junho: 6, julho: 7, setembro: 9, set: 9, outubro: 10, out: 10,
  novembro: 11, dezembro: 12, dez: 12,
  // French
  janvier: 1, janv: 1, fevrier: 2, fevr: 2, mars: 3, avril: 4, avr: 4, juin: 6, juillet: 7, juil: 7, aout: 8,
  decembre: 12,
  // German
  januar: 1, februar: 2, marz: 3, maerz: 3, juni: 6, juli: 7, oktober: 10, okt: 10, dezember: 12,
  // Italian
  gennaio: 1, gen: 1, febbraio: 2, aprile: 4, maggio: 5, mag: 5, giugno: 6, giu: 6, luglio: 7, lug: 7, settembre: 9, ottobre: 10, ott: 10,
  dicembre: 12,
};

const MONTH_NAMES = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const MONTH = `(?<![a-z])(${MONTH_NAMES})(?![a-z])\\.?`;

const MIN_YEAR = 1990;
const MAX_YEAR = 2100;
/** A bill period longer than this is not a bill period. */
const MAX_PERIOD_DAYS = 400;

const NUMERIC_YMD = /(?<![0-9]|[0-9][./-])([0-9]{4})([./-])([0-9]{1,2})\2([0-9]{1,2})(?![0-9]|[./-][0-9])/g;
const NUMERIC_DMY = /(?<![0-9]|[0-9][./-])([0-9]{1,2})([./-])([0-9]{1,2})\2([0-9]{4}|[0-9]{2})(?![0-9]|[./-][0-9])/g;
const DAY_MONTH_YEAR = new RegExp(`(?<![0-9])([0-9]{1,2})(?:st|nd|rd|th|º|\\.)?\\s*(?:de |of |del )?\\s*${MONTH},?\\s*(?:de |del )?([0-9]{4})(?![0-9])`, 'g');
const MONTH_DAY_YEAR = new RegExp(`${MONTH}\\s+([0-9]{1,2})(?:st|nd|rd|th)?,?\\s+([0-9]{4})(?![0-9])`, 'g');

function realDate(year: number, month: number, day: number): CalendarDate | null {
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function numericDayMonth(first: number, second: number, order: DateOrder): { day: number; month: number } | null {
  if (first > 12) return { day: first, month: second };
  if (second > 12) return { day: second, month: first };
  if (first === second) return { day: first, month: second };
  if (order === 'DMY') return { day: first, month: second };
  if (order === 'MDY') return { day: second, month: first };
  return null;
}

/** Every real calendar date written in the text, in reading order. Ambiguous or impossible dates are left out. */
export function findDates(text: string, order: DateOrder): DateMention[] {
  const folded = fold(text);
  const found: Array<{ index: number; date: CalendarDate }> = [];
  const add = (index: number, date: CalendarDate | null) => date && found.push({ index, date });

  for (const m of folded.matchAll(NUMERIC_YMD)) add(m.index, realDate(Number(m[1]), Number(m[3]), Number(m[4])));
  for (const m of folded.matchAll(NUMERIC_DMY)) {
    const dayMonth = numericDayMonth(Number(m[1]), Number(m[3]), order);
    const year = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]);
    if (dayMonth) add(m.index, realDate(year, dayMonth.month, dayMonth.day));
  }
  for (const m of folded.matchAll(DAY_MONTH_YEAR)) add(m.index, realDate(Number(m[3]), MONTHS[m[2]], Number(m[1])));
  for (const m of folded.matchAll(MONTH_DAY_YEAR)) add(m.index, realDate(Number(m[3]), MONTHS[m[1]], Number(m[2])));

  return found.sort((a, b) => a.index - b.index).map(({ date }) => ({ date }));
}

const PERIOD_LABEL = /periodo|\bperiod\b|periode|zeitraum|billing period|service period|facturacion|fatturazione|\bdesde\b.+\bhasta\b|\bdel\b.+\bal\b|\bfrom\b.+\bto\b|\bdu\b.+\bau\b/;

export interface BillingPeriod {
  readonly start: CalendarDate;
  readonly end: CalendarDate;
}

/**
 * The period the bill covers, read from lines that say so ("Periodo de facturación: del … al …").
 * Answers `null` when no line does, when the dates are ambiguous, when it ends before it starts,
 * is implausibly long, or when two different periods compete.
 */
export function findBillingPeriod(text: string, order: DateOrder): BillingPeriod | null {
  const lines = cleanLines(text);
  const candidates = new Map<string, BillingPeriod>();

  lines.forEach((line, index) => {
    if (!PERIOD_LABEL.test(fold(line))) return;
    let dates = findDates(line, order);
    if (dates.length < 2 && lines[index + 1]) dates = [...dates, ...findDates(lines[index + 1], order)];
    if (dates.length < 2) return;

    const [start, end] = [dates[0].date, dates[1].date];
    const days = daysInclusive(start, end);
    if (days < 1 || days > MAX_PERIOD_DAYS) return;
    candidates.set(`${start}|${end}`, { start, end });
  });

  return candidates.size === 1 ? [...candidates.values()][0] : null;
}
