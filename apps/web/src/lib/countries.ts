import { COUNTRY_CODES } from '../data/countries';
import { displayLocale } from './money';

export interface CountryOption {
  code: string;
  name: string;
}

/** "Spain" for "ES"; the code itself when the runtime does not know it. */
export function countryName(code: string, locale: string = displayLocale()): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** 🇪🇸 for "ES", built from the two regional-indicator letters. */
export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

/** Every country, sorted by its name in the reader's language. */
export function countryOptions(locale: string = displayLocale()): CountryOption[] {
  const collator = new Intl.Collator(locale);
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) =>
    collator.compare(a.name, b.name)
  );
}
