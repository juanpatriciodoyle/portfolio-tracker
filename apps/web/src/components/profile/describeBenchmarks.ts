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

export interface IncomeRow {
  headline: string;
  caption: string;
}

export interface HousingRow {
  headline: string;
  detail: string;
  caption: string;
  verdict: 'LOWER' | 'SIMILAR' | 'HIGHER';
  you: { label: string; widthPercent: number };
  typical: { label: string; widthPercent: number };
}

export interface PurchasingPowerRow {
  headline: string;
  comparisons: string[];
  unitNote: string;
  caption: string;
}

export interface PhaseBenchmarkView {
  country: string;
  income: IncomeRow | null;
  housing: HousingRow | null;
  purchasingPower: PurchasingPowerRow | null;
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

function describeIncome(dto: NonNullable<PhaseBenchmarkDto['incomePercentile']>, country: string): IncomeRow {
  const n = Math.round(dto.percentile);
  const headline =
    dto.bound === 'AT_LEAST'
      ? `Your household income is higher than at least ${n} of every 100 people in ${country}.`
      : dto.bound === 'AT_MOST'
        ? `Your household income is higher than at most ${n} of every 100 people in ${country}.`
        : n >= 50
          ? `Your household income is higher than about ${n} of every 100 people in ${country}.`
          : `In ${country}, about ${n} of every 100 people earn less than you.`;
  return { headline, caption: `${BASIS_CAPTIONS[dto.basis]} · ${dto.period} · ${SOURCE_LABELS[dto.source]}` };
}

function describeHousing(dto: NonNullable<PhaseBenchmarkDto['housingBurden']>, currency: string, country: string, locale: string): HousingRow {
  const points = trimmed(Math.abs(dto.differencePoints), locale, 1);
  const detail =
    dto.verdict === 'SIMILAR'
      ? 'About the same as a typical household.'
      : dto.verdict === 'HIGHER'
        ? `That is ${points} points more than typical.`
        : `That is ${points} points less than typical.`;
  const widest = Math.max(dto.yourSharePercent, dto.typicalSharePercent, 1);
  const width = (value: number) => Math.round((value / widest) * 100);
  return {
    headline: `Housing takes ${percent(dto.yourSharePercent, locale)} of your income. A typical household in ${country} spends ${percent(dto.typicalSharePercent, locale)}.`,
    detail: `${detail} Your housing costs come to ${formatMinor(dto.housingMonthlyMinor, currency, locale)} a month.`,
    caption: `Rent, utilities and property taxes · ${dto.period} · ${SOURCE_LABELS[dto.source]}`,
    verdict: dto.verdict,
    you: { label: percent(dto.yourSharePercent, locale), widthPercent: width(dto.yourSharePercent) },
    typical: { label: percent(dto.typicalSharePercent, locale), widthPercent: width(dto.typicalSharePercent) },
  };
}

function describePower(
  dto: NonNullable<PhaseBenchmarkDto['purchasingPower']>,
  country: string,
  nameOf: (phaseId: string) => string | undefined,
  locale: string
): PurchasingPowerRow {
  const comparisons: string[] = [];
  const previousName = dto.versusPreviousPhase && nameOf(dto.versusPreviousPhase.phaseId);
  if (dto.versusPreviousPhase && previousName) {
    comparisons.push(`That is ${times(dto.versusPreviousPhase.ratio, locale)} what you had in ${previousName}.`);
  }
  if (dto.versusNationalAverage !== null) {
    comparisons.push(`About ${times(dto.versusNationalAverage, locale)} the average person in ${country}.`);
  }
  return {
    headline: `Your income buys about $${trimmed(dto.internationalDollarsPerMonth, locale, 0)} a month at world-average prices.`,
    comparisons,
    unitNote: 'These are international dollars, a unit for comparing what money buys. They are not real money.',
    caption: `${dto.period} · ${SOURCE_LABELS[dto.source]}`,
  };
}

/** Wording for one phase's comparisons. The server did the maths; this only decides how it reads. */
export function describePhaseBenchmark(
  dto: PhaseBenchmarkDto,
  nameOf: (phaseId: string) => string | undefined = () => undefined,
  locale: string = displayLocale()
): PhaseBenchmarkView {
  const country = countryName(dto.countryCode, locale);
  const income = dto.incomePercentile ? describeIncome(dto.incomePercentile, country) : null;
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
