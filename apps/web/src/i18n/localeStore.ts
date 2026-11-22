import { isLocale, type Locale } from './locale';

export const LOCALE_STORAGE_KEY = 'locale';

/** The saved choice, or null when there is none or storage is blocked (private windows, tests). */
export function readStoredLocale(): Locale | null {
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The choice still applies for this visit; it just is not remembered.
  }
}
