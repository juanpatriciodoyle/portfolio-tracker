// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { KNOWN_VENDORS, type KnownVendor } from './vendorDictionary';
import { fold } from './textFolding';
import type { BillingCadence, FixedCostCategory } from './vocabulary';

/** The words of a name: no accents, no case, hyphens closed up, other punctuation as a break ("E.ON Next" is e / on / next). */
export function nameTokens(name: string): string[] {
  return fold(name)
    .replace(/-/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token !== '');
}

/**
 * Whether two sender names point at the same company: every word of the shorter name starts the matching
 * word of the longer one, from the first word on. "Octopus" matches "Octopus Energy" and "NETFLIX" matches
 * "Netflix", but "Energy" does not match "Octopus Energy".
 */
export function vendorNamesMatch(first: string, second: string): boolean {
  const [shorter, longer] = [nameTokens(first), nameTokens(second)].sort((a, b) => a.length - b.length);
  if (shorter.length === 0) return false;
  return shorter.every((token, index) => longer[index]?.startsWith(token) === true);
}

/** A name reduced to what identifies the sender, for grouping bills of the same sender together. */
export const vendorKey = (name: string): string => nameTokens(name).join(' ');

// ---- Layer 3: the dictionary of known senders ---------------------------------------------------

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = KNOWN_VENDORS.map((vendor) => ({
  vendor,
  pattern: new RegExp(`(?<![a-z0-9])(?:${vendor.aliases.map((alias) => escape(fold(alias))).join('|')})(?![a-z0-9])`),
}));

/** The known senders named, as whole words, anywhere in a text. */
export function knownVendorsIn(text: string): KnownVendor[] {
  const folded = fold(text);
  return PATTERNS.filter(({ pattern }) => pattern.test(folded)).map(({ vendor }) => vendor);
}

/** Shortest start of a sender's name worth reading as "the person is typing that sender". */
const MIN_TYPED_CHARACTERS = 3;

/** The senders a typed name is: it contains one of their names, or is the start of one. */
function sendersNamed(name: string, countryCode: string | null | undefined): KnownVendor[] {
  const [first = ''] = nameTokens(name);
  const typing = first.length >= MIN_TYPED_CHARACTERS;
  const named = KNOWN_VENDORS.filter(
    (vendor) => knownVendorsIn(name).includes(vendor) || (typing && vendor.aliases.some((alias) => vendorNamesMatch(name, alias)))
  );
  if (named.length <= 1 || !countryCode) return named;

  const local = named.filter((vendor) => vendor.countries?.includes(countryCode));
  return local.length > 0 ? local : named;
}

// ---- Layer 2: words that name a service, in several languages -------------------------------------

/** Word starts, without accents. A stem of up to three letters must be the whole word ("gas" is not "gasolinera"). */
const SERVICE_STEMS: Readonly<Record<FixedCostCategory, readonly string[]>> = {
  ELECTRICITY: ['electr', 'elektr', 'energ', 'luz', 'luce', 'power', 'strom', 'prad'],
  GAS: ['gas', 'gaz', 'naturgy'],
  WATER: ['water', 'agua', 'acqua', 'acque', 'aigue', 'canal', 'veolia', 'eau', 'wasser', 'woda', 'wodoci'],
  HEATING_COOLING: ['heat', 'cool', 'aero', 'calefac', 'clima', 'therm', 'chauffage', 'heiz', 'fernwarme', 'ogrzew', 'riscaldamento', 'calor'],
  INTERNET: ['fibra', 'fiber', 'fibre', 'telecom', 'wifi', 'broadband', 'internet'],
  PHONE: ['telef', 'mobile', 'movil', 'mobil'],
  TAXES: ['tax', 'impuesto', 'ibi', 'tasa', 'council', 'imposta', 'steuer', 'podatek', 'taxe'],
  SUBSCRIPTIONS: ['netflix', 'spotify', 'apple', 'prime', 'icloud', 'gym', 'disney', 'hbo', 'youtube', 'adobe', 'dropbox', 'openai', 'fitness', 'subscri', 'suscrip'],
  RENT: ['rent', 'alquiler', 'arrend', 'landlord', 'loyer', 'affitto', 'aluguel', 'miete', 'czynsz'],
  OTHER: [],
};

const MAX_WHOLE_WORD_STEM = 3;
const stemMatches = (token: string, stem: string) => (stem.length <= MAX_WHOLE_WORD_STEM ? token === stem : token.startsWith(stem));

/** The one category the words of a name point to; null when none does, or when two do equally. */
function categoryFromWords(name: string): FixedCostCategory | null {
  const tokens = nameTokens(name);
  const scores = (Object.keys(SERVICE_STEMS) as FixedCostCategory[])
    .map((category) => ({ category, score: tokens.filter((token) => SERVICE_STEMS[category].some((stem) => stemMatches(token, stem))).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (scores.length === 0) return null;
  return scores.length === 1 || scores[0].score > scores[1].score ? scores[0].category : null;
}

// ---- Layer 1: what the person already has ---------------------------------------------------------

/** A sender the person already declared a cost for, or logged a bill from. List the newest first. */
export interface VendorHistoryEntry {
  readonly vendor: string;
  readonly category: FixedCostCategory;
  readonly cadence: BillingCadence | null;
}

export type SuggestionSource = 'HISTORY' | 'KEYWORD' | 'DICTIONARY';

export interface VendorSuggestion {
  readonly category: FixedCostCategory;
  /** null when it is not known how often this sender bills. */
  readonly cadence: BillingCadence | null;
  readonly source: SuggestionSource;
}

function fromHistory(name: string, history: readonly VendorHistoryEntry[]): VendorSuggestion | null {
  const uses = new Map<string, { entry: VendorHistoryEntry; count: number }>();
  for (const entry of history) {
    if (!vendorNamesMatch(name, entry.vendor)) continue;
    const key = `${entry.category}/${entry.cadence}`;
    uses.set(key, { entry, count: (uses.get(key)?.count ?? 0) + 1 });
  }
  const [mostCommon] = [...uses.values()].sort((a, b) => b.count - a.count);
  return mostCommon ? { category: mostCommon.entry.category, cadence: mostCommon.entry.cadence, source: 'HISTORY' } : null;
}

/**
 * What a bill from this sender is probably for, and how often it comes, worked out on the device with no
 * network. Three layers, the first that knows wins: (1) the senders the person already has, (2) the words
 * of the name in several languages, (3) a dictionary of well-known senders, using the country of the
 * living phase to tell apart senders that share a name. A suggestion is a starting point to be overridden.
 */
export function suggestForVendor(input: {
  readonly name: string;
  readonly countryCode?: string | null;
  readonly history?: readonly VendorHistoryEntry[];
}): VendorSuggestion | null {
  if (nameTokens(input.name).length === 0) return null;

  const fromPeople = fromHistory(input.name, input.history ?? []);
  if (fromPeople) return fromPeople;

  const senders = sendersNamed(input.name, input.countryCode);
  const known = senders.length > 0 && senders.every((sender) => sender.categories[0] === senders[0].categories[0]) ? senders[0] : null;

  const byWords = categoryFromWords(input.name);
  if (byWords) return { category: byWords, cadence: known?.categories.includes(byWords) ? (known.cadence ?? null) : null, source: 'KEYWORD' };
  return known ? { category: known.categories[0], cadence: known.cadence ?? null, source: 'DICTIONARY' } : null;
}
