import { COUNTRY_CODES } from '../data/countries';
import { countryName } from './countries';
import { displayLocale } from './money';

/** A country and every way a person might type its name: in each language, without accents, or as its ISO code. */
export interface CountryIndexEntry {
  code: string;
  /** The name shown to the reader: the first language given when the index was built. */
  name: string;
  /** Normalized spellings to match against. */
  keys: readonly string[];
}

export type CountryResolution =
  | { kind: 'match'; code: string }
  | { kind: 'ambiguous'; codes: readonly string[] }
  | { kind: 'none' };

/** Lower case, no accents, no surrounding or doubled spaces: "  EspAÑa " becomes "espana". */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every country, sorted by its name in the first language, searchable in all of the given ones. */
export function buildCountryIndex(locales: readonly string[] = [displayLocale(), 'en', 'es']): CountryIndexEntry[] {
  const collator = new Intl.Collator(locales[0]);
  return COUNTRY_CODES.map((code) => {
    const names = locales.map((locale) => countryName(code, locale));
    return { code, name: names[0], keys: [...new Set(names.map(normalizeSearchText))] };
  }).sort((a, b) => collator.compare(a.name, b.name));
}

const RANK_CODE = 0;
const RANK_PREFIX = 1;
const RANK_CONTAINS = 2;

/** How well a query fits an entry: its code first, then names that start with it, then names that contain it. */
function rankOf(entry: CountryIndexEntry, query: string): number | null {
  if (entry.code.toLowerCase() === query) return RANK_CODE;
  if (entry.keys.some((key) => key.startsWith(query))) return RANK_PREFIX;
  if (entry.keys.some((key) => key.includes(query))) return RANK_CONTAINS;
  return null;
}

/** The countries that fit what has been typed, best fit first and alphabetical within a fit. */
export function searchCountries(index: readonly CountryIndexEntry[], text: string): CountryIndexEntry[] {
  const query = normalizeSearchText(text);
  if (query === '') return [...index];

  return index
    .flatMap((entry) => {
      const rank = rankOf(entry, query);
      return rank === null ? [] : [{ entry, rank }];
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ entry }) => entry);
}

/**
 * Turns typed text into one country: a full name in any language, an ISO code, or a beginning only one
 * country has. A beginning shared by several countries is ambiguous rather than guessed.
 */
export function resolveCountry(index: readonly CountryIndexEntry[], text: string): CountryResolution {
  const query = normalizeSearchText(text);
  if (query === '') return { kind: 'none' };

  const exact = index.find((entry) => entry.code.toLowerCase() === query || entry.keys.includes(query));
  if (exact) return { kind: 'match', code: exact.code };

  const starting = index.filter((entry) => entry.keys.some((key) => key.startsWith(query)));
  if (starting.length === 1) return { kind: 'match', code: starting[0].code };
  if (starting.length > 1) return { kind: 'ambiguous', codes: starting.map((entry) => entry.code) };
  return { kind: 'none' };
}

/** Typed or pasted text broken into separate entries at commas, semicolons and line breaks. */
export function splitEntries(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '');
}
