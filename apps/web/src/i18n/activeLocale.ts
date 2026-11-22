import type { Locale } from './locale';

/**
 * The language the person chose, kept where the formatters can read it. Only the provider writes it
 * (the shell); formatting functions take a locale argument and use this only as their default.
 */
let active: Locale | null = null;

export function setActiveLocale(locale: Locale | null): void {
  active = locale;
}

export function activeLocale(): Locale | null {
  return active;
}
