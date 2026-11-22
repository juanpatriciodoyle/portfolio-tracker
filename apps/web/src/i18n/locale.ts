/** The languages the app speaks. Add one here, give it a folder of catalogs, and list it in `catalogs.ts`. */
export const LOCALES = ['en', 'es-AR'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Each language in its own words, so a person finds theirs whatever the page says now. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', 'es-AR': 'Español (Argentina)' };

export const isLocale = (value: unknown): value is Locale => LOCALES.some((locale) => locale === value);

/** The BCP 47 tag `Intl` formats numbers, currencies and dates with. */
export function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-US' : locale;
}

/** A saved choice wins; otherwise any Spanish browser gets Argentine Spanish and everyone else English. */
export function detectLocale(saved: string | null, browserLanguage: string | undefined): Locale {
  if (isLocale(saved)) return saved;
  return browserLanguage?.toLowerCase().startsWith('es') ? 'es-AR' : DEFAULT_LOCALE;
}
