// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { z } from 'zod';

/** Largest amount accepted at the boundary, in minor units (cents). Keeps every sum far below 2^53. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000;

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2200) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const calendarDateSchema = z.string().refine(isRealCalendarDate, 'Expected a real date as YYYY-MM-DD');
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 code such as EUR');
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'Expected an ISO 3166-1 alpha-2 code such as ES');

/** A non-negative whole number of minor units (cents) in some currency. */
export const amountMinorSchema = z.number().int().min(0).max(MAX_AMOUNT_MINOR);

/** Optional free text: absent or null clears it, otherwise 1..max characters once trimmed. */
export const optionalTextSchema = (max: number) => z.string().trim().min(1).max(max).nullish();

export const hasAtLeastOneKey = (value: object) => Object.keys(value).length > 0;
