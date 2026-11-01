import type { BenchmarkGap, BenchmarkSource, PhaseBenchmarkDto } from '../../contracts';
import { countryName } from '../../lib/countries';
import { displayLocale } from '../../lib/money';
import { formatMinor } from '../../lib/money';

export const SOURCE_LABELS: Readonly<Record<BenchmarkSource, string>> = {
  EUROSTAT: 'Eurostat',
  INDEC: 'INDEC',
  WORLD_BANK: 'World Bank',
  NUMBEO: 'Numbeo',
};

export const GAP_REASONS: Readonly<Record<BenchmarkGap, string>> = {
  NO_INCOME: 'Add a monthly income to this living phase to see how you compare.',
  NO_DISTRIBUTION: 'No income statistics are published for this country, so we cannot place your income.',
  NO_HOUSING_BASELINE: 'No typical housing cost figure is published for this country.',
  NO_PURCHASING_POWER: 'No price level figure is published for this country.',
  CURRENCY_MISMATCH: 'This living phase’s income is not in the currency of the country, so it cannot be compared with national figures directly.',
};

/** One glanceable figure. `note` holds the methodology and shows only on hover or focus. */
export interface Kpi {
  label: string;
  value: string;
  sub: string | null;
  note: string;
}

export interface HousingKpi extends Kpi {
  verdict: 'LOWER' | 'SIMILAR' | 'HIGHER';
}

export interface PhaseBenchmarkView {
  country: string;
  income: Kpi | null;
  housing: HousingKpi | null;
  purchasingPower: Kpi | null;
  gaps: string[];
  /** True when at least one comparison could be made. */
  hasComparison: boolean;
}

const BASIS_CAPTIONS = {
  EQUIVALISED: 'per person, adjusted for household size',
  PER_CAPITA: 'per person',
} as const;

const trimmed = (value: number, locale: string, maximumFractionDigits: number) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);

const percent = (value: number, locale: string) => `${trimmed(value, locale, 1)}%`;
const times = (ratio: number, locale: string) => `${trimmed(ratio, locale, 2)}x`;

const ENGLISH_ORDINAL_SUFFIX: Readonly<Record<string, string>> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };

/** "89th" in English; other languages get the bare number rather than a wrong suffix. */
function ordinal(n: number, locale: string): string {
  if (!locale.toLowerCase().startsWith('en')) return String(n);
  return `${n}${ENGLISH_ORDINAL_SUFFIX[new Intl.PluralRules('en', { type: 'ordinal' }).select(n)]}`;
}

function describeIncome(dto: NonNullable<PhaseBenchmarkDto['incomePercentile']>, country: string, locale: string): Kpi {
  const n = Math.round(dto.percentile);
  const bound = dto.bound === 'AT_LEAST' ? 'At least ' : dto.bound === 'AT_MOST' ? 'At most ' : '';
  return {
    label: 'Income',
    value: `${bound}${ordinal(n, locale)} percentile`,
    sub: n >= 50 ? `Top ${Math.max(1, 100 - n)}%` : `Bottom ${Math.max(1, n)}%`,
    note: `Your household income compared with people in ${country}, ${BASIS_CAPTIONS[dto.basis]}. ${dto.period} · ${SOURCE_LABELS[dto.source]}`,
  };
}

function describeHousing(dto: NonNullable<PhaseBenchmarkDto['housingBurden']>, currency: string, country: string, locale: string): HousingKpi {
  return {
    label: 'Housing',
    value: `${percent(dto.yourSharePercent, locale)} housing burden`,
    sub: `vs. ${percent(dto.typicalSharePercent, locale)} typical`,
    note: `Rent, utilities and property taxes come to ${formatMinor(dto.housingMonthlyMinor, currency, locale)} a month. A typical household in ${country} spends ${percent(dto.typicalSharePercent, locale)}. ${dto.period} · ${SOURCE_LABELS[dto.source]}`,
    verdict: dto.verdict,
  };
}

function describePower(
  dto: NonNullable<PhaseBenchmarkDto['purchasingPower']>,
  country: string,
  nameOf: (phaseId: string) => string | undefined,
  locale: string
): Kpi {
  const previousName = dto.versusPreviousPhase && nameOf(dto.versusPreviousPhase.phaseId);
  const extra =
    dto.versusPreviousPhase && previousName ? ` That is ${times(dto.versusPreviousPhase.ratio, locale)} what you had in ${previousName}.` : '';
  const dollars = `$${trimmed(dto.internationalDollarsPerMonth, locale, 0)}`;
  return {
    label: 'Purchasing power',
    value: dto.versusNationalAverage !== null ? `${times(dto.versusNationalAverage, locale)} purchasing power` : `${dollars} a month`,
    sub: dto.versusNationalAverage !== null ? `vs. the average person in ${country}` : 'at world-average prices',
    note: `Your income buys about ${dollars} a month at world-average prices (international dollars, a unit for comparing what money buys, not real money).${extra} ${dto.period} · ${SOURCE_LABELS[dto.source]}`,
  };
}

/** Wording for one phase's comparisons. The server did the maths; this only decides how it reads. */
export function describePhaseBenchmark(
  dto: PhaseBenchmarkDto,
  nameOf: (phaseId: string) => string | undefined = () => undefined,
  locale: string = displayLocale()
): PhaseBenchmarkView {
  const country = countryName(dto.countryCode, locale);
  const income = dto.incomePercentile ? describeIncome(dto.incomePercentile, country, locale) : null;
  const housing = dto.housingBurden ? describeHousing(dto.housingBurden, dto.currency, country, locale) : null;
  const purchasingPower = dto.purchasingPower ? describePower(dto.purchasingPower, country, nameOf, locale) : null;
  return {
    country,
    income,
    housing,
    purchasingPower,
    gaps: dto.gaps.map((gap) => GAP_REASONS[gap]),
    hasComparison: income !== null || housing !== null || purchasingPower !== null,
  };
}

/** "20 Oct 2026", or null when nothing was fetched yet. */
export function describeRefreshedAt(refreshedAt: string | null, locale: string = displayLocale()): string | null {
  if (!refreshedAt) return null;
  const date = new Date(refreshedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
