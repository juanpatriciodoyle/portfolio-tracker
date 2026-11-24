import type { Translate } from '../i18n/translate';
import { displayLocale, formatUpTo } from './money';

const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365.25;
/** From this many days a holding is counted in months, and from DAYS_BEFORE_YEARS in years. */
const DAYS_BEFORE_MONTHS = 30;
const DAYS_BEFORE_YEARS = 365;
/** A holding bought today has been held for one day: "0 days" is never shown. */
const MIN_DAYS = 1;

/** How long a holding has been held, in the unit that reads best: "12 days", "3 months", "6.8 years". Display only. */
export function formatHeld(days: number, t: Translate, locale: string = displayLocale()): string {
  const held = Math.max(MIN_DAYS, days);
  if (held < DAYS_BEFORE_MONTHS) return t('holdings.held.days', { count: Math.round(held), amount: formatUpTo(Math.round(held), 0, locale) });
  if (held < DAYS_BEFORE_YEARS) {
    const months = Math.round(held / DAYS_PER_MONTH);
    return t('holdings.held.months', { count: months, amount: formatUpTo(months, 0, locale) });
  }
  const years = Math.round((held / DAYS_PER_YEAR) * 10) / 10;
  return t('holdings.held.years', { count: years, amount: formatUpTo(years, 1, locale) });
}
