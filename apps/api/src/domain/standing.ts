import { AVERAGE_DAYS_PER_MONTH } from '../contracts/calendarDate';
import { currencyExponent } from './documentExtraction/currencies';
import { percentileAmong, type Household } from './benchmarks';

const round1 = (value: number) => Math.round(value * 10) / 10;

export { percentileAmong };

const isPositive = (value: number) => Number.isFinite(value) && value > 0;

/**
 * A household's monthly income as international dollars per person per day, the unit of the World Bank's global
 * distributions (constant 2021 prices). `lcuPerInternationalDollar` is the PPP factor of the country (current prices of
 * its year) and `priceIndexSince2021` how much dollar prices rose between 2021 and that year, so the result is in 2021 prices.
 */
export function referenceDollarsPerDay(input: {
  readonly monthlyIncomeMinor: number;
  readonly currency: string;
  readonly household: Household;
  readonly lcuPerInternationalDollar: number;
  readonly priceIndexSince2021: number;
}): number | null {
  if (!isPositive(input.lcuPerInternationalDollar) || !isPositive(input.priceIndexSince2021)) return null;
  const monthlyMajor = input.monthlyIncomeMinor / 10 ** currencyExponent(input.currency);
  const people = input.household.adults + input.household.children;
  return monthlyMajor / people / AVERAGE_DAYS_PER_MONTH / input.lcuPerInternationalDollar / input.priceIndexSince2021;
}

/** Converts minor units between currencies; `rates` is the euro value of one unit of each. Null when a rate is missing. */
export function convertAmountMinor(amountMinor: number, from: string, to: string, rates: Readonly<Record<string, number>>): number | null {
  if (from === to) return amountMinor;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!isPositive(fromRate ?? Number.NaN) || !isPositive(toRate ?? Number.NaN)) return null;
  const major = (amountMinor / 10 ** currencyExponent(from)) * (fromRate / toRate);
  return Math.round(major * 10 ** currencyExponent(to));
}

/** Europe outside the EU is still compared with the EU: no combined source exists for the wider continent. */
const EUROPE = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'GB', 'CH', 'NO', 'IS', 'LI', 'AD', 'MC', 'SM', 'AL', 'BA', 'ME', 'MK', 'RS', 'XK', 'UA', 'MD',
]);

const REGION_NAMES: Readonly<Record<string, string>> = {
  LCN: 'Latin America & the Caribbean',
  NAC: 'North America',
  ECS: 'Europe & Central Asia',
  EAS: 'East Asia & Pacific',
  SAS: 'South Asia',
  MEA: 'the Middle East, North Africa, Afghanistan & Pakistan',
  SSF: 'Sub-Saharan Africa',
};

export interface ReferenceArea {
  readonly code: string;
  readonly name: string;
}

/** The "continent" a country is compared with: the EU for Europe, else its World Bank region. Null when it has none. */
export function continentAreaOf(countryCode: string, regionCode: string | null): ReferenceArea | null {
  if (EUROPE.has(countryCode)) return { code: 'EU', name: 'the EU' };
  const name = regionCode ? REGION_NAMES[regionCode] : undefined;
  return regionCode && name ? { code: regionCode, name } : null;
}

/** Every area a reference distribution can be kept for, besides the EU. */
export const WORLD_AREA: ReferenceArea = { code: 'WLD', name: 'the world' };
export const WORLD_BANK_REGION_CODES: readonly string[] = [WORLD_AREA.code, ...Object.keys(REGION_NAMES)];
export const regionName = (code: string): string | null => (code === WORLD_AREA.code ? WORLD_AREA.name : (REGION_NAMES[code] ?? null));

/** Areas kept as a whole (the EU, a region, the world) rather than a country: their statistics change slowly. */
export const isReferenceArea = (code: string): boolean => code === 'EU' || code.length === 3;
