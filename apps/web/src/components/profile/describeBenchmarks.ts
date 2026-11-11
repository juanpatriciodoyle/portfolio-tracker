import type { BenchmarkGap, BenchmarkSource, NationalityEquivalenceDto, PhaseBenchmarkDto, StandingDto, StandingScope } from '../../contracts';
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
  NO_CONTINENT_REFERENCE: 'No comparison with your continent is available for this country yet.',
  NO_WORLD_REFERENCE: 'The world comparison is being prepared or is not available right now. It is refreshed about every six months.',
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

export interface NationalityEquivalenceView {
  countryCode: string;
  text: string;
  /** Where the equivalent income would rank among people there, when that country publishes a distribution. */
  tier: string | null;
}

/** "Top 11% in Spain": one rung of where the person stands. */
export interface StandingBadge {
  scope: StandingScope;
  text: string;
}

/** Where the numbers come from, for the data sources. */
export interface SourceView {
  name: string;
  url: string;
  /** "20 Oct 2026". */
  retrieved: string | null;
}

/** The clean, rewarding summary: only what the data supports. `unavailable` is the rankings that have no source yet. */
export interface PositioningView {
  /** Country, continent and world, in that order; a rung the data cannot place is left out. */
  badges: StandingBadge[];
  /** Up to three one-line comparisons, worded for what they say about the person. */
  insights: string[];
  equivalences: NationalityEquivalenceView[];
  unavailable: string[];
}

export interface PhaseBenchmarkView {
  country: string;
  positioning: PositioningView;
  income: Kpi | null;
  /** The continent and world rungs, with what was compared and where it comes from. */
  areaFigures: Kpi[];
  sources: SourceView[];
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

const UNAVAILABLE_RANKINGS = ['City rankings need city-level income statistics, which are not connected yet.'];

/** "Top 11% in Spain": the share of people the income is above, from the top. */
function tierBadge(dto: { percentile: number; bound: 'EXACT' | 'AT_MOST' | 'AT_LEAST' }, country: string, locale: string): string {
  const n = Math.round(dto.percentile);
  const top = Math.max(1, 100 - n);
  if (dto.bound === 'AT_LEAST') return `Top ${top}% or better in ${country}`;
  if (dto.bound === 'AT_MOST') return `Below the ${ordinal(n, locale)} percentile in ${country}`;
  return `Top ${top}% in ${country}`;
}

function describeEquivalence(dto: NationalityEquivalenceDto, locale: string): NationalityEquivalenceView {
  const country = countryName(dto.countryCode, locale);
  return {
    countryCode: dto.countryCode,
    text: `Holds the purchasing power of ${formatMinor(dto.equivalentMonthlyIncomeMinor, dto.currency, locale)} a month in ${country}`,
    tier: dto.incomePercentile ? tierBadge(dto.incomePercentile, country, locale) : null,
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

const VERDICT_WORDS = { LOWER: 'below', SIMILAR: 'in line with', HIGHER: 'above' } as const;

/** "Housing takes 24% of your income — below the 31% average in Spain": the share, and how it sits against the typical one. */
function housingInsight(dto: NonNullable<PhaseBenchmarkDto['housingBurden']>, where: string, locale: string): string {
  return `Housing takes ${percent(dto.yourSharePercent, locale)} of your income — ${VERDICT_WORDS[dto.verdict]} the ${percent(dto.typicalSharePercent, locale)} average in ${where}`;
}

const areaOf = (entry: StandingDto, country: string) => (entry.scope === 'COUNTRY' ? country : (entry.areaName ?? entry.areaCode));

/** What was compared for a continent or world rung, in words and with its figure. */
function describeAreaFigure(entry: StandingDto, area: string, locale: string): Kpi {
  const n = Math.round(entry.percentile);
  const bound = entry.bound === 'AT_LEAST' ? 'At least ' : entry.bound === 'AT_MOST' ? 'At most ' : '';
  const origin = `${entry.period} · ${SOURCE_LABELS[entry.source]}`;
  const yours =
    entry.yourValue === null ? '' : entry.measuredAs === 'EURO_INCOME' ? formatMinor(Math.round(entry.yourValue * 100), 'EUR', locale) : `$${trimmed(entry.yourValue, locale, 0)}`;
  const note =
    entry.measuredAs === 'EURO_INCOME'
      ? `Your income of about ${yours} a year per person (adjusted for household size, converted to euros) compared with people in ${area}. ${origin}`
      : `Your income of about ${yours} a day per person, in international dollars at 2021 prices, compared with people in ${area}. ${origin}`;
  return { label: `In ${area}`, value: `${bound}${ordinal(n, locale)} percentile`, sub: n >= 50 ? `Top ${Math.max(1, 100 - n)}%` : `Bottom ${Math.max(1, n)}%`, note };
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
  const areaFigures = dto.standing.filter((entry) => entry.scope !== 'COUNTRY').map((entry) => describeAreaFigure(entry, areaOf(entry, country), locale));
  const insights = [
    dto.housingBurden ? housingInsight(dto.housingBurden, country, locale) : null,
    dto.continentHousing ? housingInsight(dto.continentHousing, dto.continentHousing.areaName, locale) : null,
    dto.purchasingPower?.versusNationalAverage != null
      ? `Your income buys ${times(dto.purchasingPower.versusNationalAverage, locale)} what the average person in ${country} has`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .slice(0, 3);
  const sources = [...new Map(dto.standing.map((entry) => [entry.citation.url, entry.citation] as const)).values()].map((citation) => ({
    name: citation.name,
    url: citation.url,
    retrieved: describeRefreshedAt(citation.retrievedAt, locale),
  }));
  return {
    country,
    positioning: {
      badges: dto.standing.map((entry) => ({ scope: entry.scope, text: tierBadge(entry, areaOf(entry, country), locale) })),
      insights,
      equivalences: dto.nationalityEquivalences.map((equivalence) => describeEquivalence(equivalence, locale)),
      unavailable: UNAVAILABLE_RANKINGS,
    },
    income,
    areaFigures,
    sources,
    housing,
    purchasingPower,
    gaps: dto.gaps.map((gap) => GAP_REASONS[gap]),
    hasComparison: income !== null || dto.standing.length > 0 || housing !== null || purchasingPower !== null || dto.nationalityEquivalences.length > 0,
  };
}

/** "20 Oct 2026", or null when nothing was fetched yet. */
export function describeRefreshedAt(refreshedAt: string | null, locale: string = displayLocale()): string | null {
  if (!refreshedAt) return null;
  const date = new Date(refreshedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
