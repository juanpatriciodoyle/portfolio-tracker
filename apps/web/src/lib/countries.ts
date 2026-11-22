import { displayLocale } from './money';

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
