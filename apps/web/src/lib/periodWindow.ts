import type { Locale } from '../i18n/locale';

/** Day first, as in Britain and Argentina: "11 Nov 2026" / "11 nov 2026". */
const WINDOW_LOCALE: Record<Locale, string> = { en: 'en-GB', 'es-AR': 'es-AR' };

const day = (date: Date, withYear: boolean, locale: Locale) =>
  date.toLocaleDateString(WINDOW_LOCALE[locale], { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

/** "1 Jan – 11 Nov 2026": the days a reporting period covers, in the language of the screen whatever the browser's. */
export function describePeriodWindow({ startDate, endDate }: { startDate: Date; endDate: Date }, locale: Locale = 'en'): string {
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  return `${day(startDate, !sameYear, locale)} – ${day(endDate, true, locale)}`;
}
