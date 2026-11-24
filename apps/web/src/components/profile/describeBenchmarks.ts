import type { BenchmarkGap, BenchmarkSource, NationalityEquivalenceDto, PhaseBenchmarkDto, StandingDto, StandingScope } from '../../contracts';
import { countryName } from '../../lib/countries';
import type { MessageKey } from '../../i18n/catalogs';
import { currentTranslator, type Translate } from '../../i18n/translate';
import { displayLocale, formatMinor } from '../../lib/money';

export const SOURCE_LABELS: Readonly<Record<BenchmarkSource, string>> = {
  EUROSTAT: 'Eurostat',
  INDEC: 'INDEC',
  WORLD_BANK: 'World Bank',
  NUMBEO: 'Numbeo',
};

export const GAP_REASONS: Readonly<Record<BenchmarkGap, MessageKey>> = {
  NO_INCOME: 'benchmark.gap.NO_INCOME',
  NO_DISTRIBUTION: 'benchmark.gap.NO_DISTRIBUTION',
  NO_HOUSING_BASELINE: 'benchmark.gap.NO_HOUSING_BASELINE',
  NO_PURCHASING_POWER: 'benchmark.gap.NO_PURCHASING_POWER',
  CURRENCY_MISMATCH: 'benchmark.gap.CURRENCY_MISMATCH',
  NO_CONTINENT_REFERENCE: 'benchmark.gap.NO_CONTINENT_REFERENCE',
  NO_WORLD_REFERENCE: 'benchmark.gap.NO_WORLD_REFERENCE',
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
  EQUIVALISED: 'benchmark.basis.EQUIVALISED',
  PER_CAPITA: 'benchmark.basis.PER_CAPITA',
} as const satisfies Record<string, MessageKey>;

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

/** "89th percentile", "At least 89th percentile" or "At most 89th percentile". */
function percentileText(dto: { percentile: number; bound: 'EXACT' | 'AT_MOST' | 'AT_LEAST' }, locale: string, t: Translate): string {
  const key = dto.bound === 'AT_LEAST' ? 'benchmark.percentileAtLeast' : dto.bound === 'AT_MOST' ? 'benchmark.percentileAtMost' : 'benchmark.percentile';
  return t(key, { ordinal: ordinal(Math.round(dto.percentile), locale) });
}

function describeIncome(dto: NonNullable<PhaseBenchmarkDto['incomePercentile']>, country: string, locale: string, t: Translate): Kpi {
  const n = Math.round(dto.percentile);
  return {
    label: t('benchmark.income.label'),
    value: percentileText(dto, locale, t),
    sub: n >= 50 ? t('benchmark.top', { n: Math.max(1, 100 - n) }) : t('benchmark.bottom', { n: Math.max(1, n) }),
    note: t('benchmark.income.note', { country, basis: t(BASIS_CAPTIONS[dto.basis]), period: dto.period, source: SOURCE_LABELS[dto.source] }),
  };
}

/** "Top 11% in Spain": the share of people the income is above, from the top. */
function tierBadge(dto: { percentile: number; bound: 'EXACT' | 'AT_MOST' | 'AT_LEAST' }, country: string, locale: string, t: Translate): string {
  const n = Math.round(dto.percentile);
  const top = Math.max(1, 100 - n);
  if (dto.bound === 'AT_LEAST') return t('benchmark.tier.atLeast', { top, country });
  if (dto.bound === 'AT_MOST') return t('benchmark.tier.atMost', { ordinal: ordinal(n, locale), country });
  return t('benchmark.tier.exact', { top, country });
}

function describeEquivalence(dto: NationalityEquivalenceDto, locale: string, t: Translate): NationalityEquivalenceView {
  const country = countryName(dto.countryCode, locale);
  return {
    countryCode: dto.countryCode,
    text: t('benchmark.equivalence', { amount: formatMinor(dto.equivalentMonthlyIncomeMinor, dto.currency, locale), country }),
    tier: dto.incomePercentile ? tierBadge(dto.incomePercentile, country, locale, t) : null,
  };
}

function describeHousing(dto: NonNullable<PhaseBenchmarkDto['housingBurden']>, currency: string, country: string, locale: string, t: Translate): HousingKpi {
  return {
    label: t('benchmark.housing.label'),
    value: t('benchmark.housing.value', { percent: percent(dto.yourSharePercent, locale) }),
    sub: t('benchmark.housing.sub', { percent: percent(dto.typicalSharePercent, locale) }),
    note: t('benchmark.housing.note', {
      amount: formatMinor(dto.housingMonthlyMinor, currency, locale),
      country,
      percent: percent(dto.typicalSharePercent, locale),
      period: dto.period,
      source: SOURCE_LABELS[dto.source],
    }),
    verdict: dto.verdict,
  };
}

function describePower(
  dto: NonNullable<PhaseBenchmarkDto['purchasingPower']>,
  country: string,
  nameOf: (phaseId: string) => string | undefined,
  locale: string,
  t: Translate
): Kpi {
  const previousName = dto.versusPreviousPhase && nameOf(dto.versusPreviousPhase.phaseId);
  const extra =
    dto.versusPreviousPhase && previousName ? ` ${t('benchmark.power.extra', { times: times(dto.versusPreviousPhase.ratio, locale), name: previousName })}` : '';
  const dollars = `$${trimmed(dto.internationalDollarsPerMonth, locale, 0)}`;
  return {
    label: t('benchmark.power.label'),
    value: dto.versusNationalAverage !== null ? t('benchmark.power.value', { times: times(dto.versusNationalAverage, locale) }) : t('benchmark.power.valueDollars', { dollars }),
    sub: dto.versusNationalAverage !== null ? t('benchmark.power.sub', { country }) : t('benchmark.power.subWorld'),
    note: t('benchmark.power.note', { dollars, extra, period: dto.period, source: SOURCE_LABELS[dto.source] }),
  };
}

/**
 * "Your rent is 38% of your income. People who pay rent in Spain typically spend 31%.": a description, not a judgement.
 * The comparison is rent against households that pay rent, so a tenant is never set against owners.
 */
function housingInsight(dto: NonNullable<PhaseBenchmarkDto['housingBurden']>, where: string, locale: string, t: Translate): string {
  return t('benchmark.insight.housing', { share: percent(dto.yourSharePercent, locale), typical: percent(dto.typicalSharePercent, locale), where });
}

/** One line for the country and the EU when both typical shares read the same, so nothing is said twice. */
function housingInsights(dto: PhaseBenchmarkDto, country: string, locale: string, t: Translate): string[] {
  const { housingBurden, continentHousing } = dto;
  if (housingBurden && continentHousing && percent(housingBurden.typicalSharePercent, locale) === percent(continentHousing.typicalSharePercent, locale)) {
    return [
      t('benchmark.insight.housingBoth', {
        share: percent(housingBurden.yourSharePercent, locale),
        typical: percent(housingBurden.typicalSharePercent, locale),
        country,
        area: continentHousing.areaName,
      }),
    ];
  }
  return [
    ...(housingBurden ? [housingInsight(housingBurden, country, locale, t)] : []),
    ...(continentHousing ? [housingInsight(continentHousing, continentHousing.areaName, locale, t)] : []),
  ];
}

const areaOf = (entry: StandingDto, country: string) => (entry.scope === 'COUNTRY' ? country : (entry.areaName ?? entry.areaCode));

/** What was compared for a continent or world rung, in words and with its figure. */
function describeAreaFigure(entry: StandingDto, area: string, locale: string, t: Translate): Kpi {
  const n = Math.round(entry.percentile);
  const origin = `${entry.period} · ${SOURCE_LABELS[entry.source]}`;
  const yours =
    entry.yourValue === null ? '' : entry.measuredAs === 'EURO_INCOME' ? formatMinor(Math.round(entry.yourValue * 100), 'EUR', locale) : `$${trimmed(entry.yourValue, locale, 0)}`;
  const note = t(entry.measuredAs === 'EURO_INCOME' ? 'benchmark.area.noteEuro' : 'benchmark.area.noteDollars', { yours, area, origin });
  return {
    label: t('benchmark.area.label', { area }),
    value: percentileText(entry, locale, t),
    sub: n >= 50 ? t('benchmark.top', { n: Math.max(1, 100 - n) }) : t('benchmark.bottom', { n: Math.max(1, n) }),
    note,
  };
}

/** Wording for one phase's comparisons. The server did the maths; this only decides how it reads. */
export function describePhaseBenchmark(
  dto: PhaseBenchmarkDto,
  nameOf: (phaseId: string) => string | undefined = () => undefined,
  locale: string = displayLocale(),
  t: Translate = currentTranslator()
): PhaseBenchmarkView {
  const country = countryName(dto.countryCode, locale);
  const income = dto.incomePercentile ? describeIncome(dto.incomePercentile, country, locale, t) : null;
  const housing = dto.housingBurden ? describeHousing(dto.housingBurden, dto.currency, country, locale, t) : null;
  const purchasingPower = dto.purchasingPower ? describePower(dto.purchasingPower, country, nameOf, locale, t) : null;
  const areaFigures = dto.standing.filter((entry) => entry.scope !== 'COUNTRY').map((entry) => describeAreaFigure(entry, areaOf(entry, country), locale, t));
  const insights = [
    ...housingInsights(dto, country, locale, t),
    ...(dto.purchasingPower?.versusNationalAverage != null
      ? [t('benchmark.insight.power', { times: times(dto.purchasingPower.versusNationalAverage, locale), country })]
      : []),
  ].slice(0, 3);
  const sources = [...new Map(dto.standing.map((entry) => [entry.citation.url, entry.citation] as const)).values()].map((citation) => ({
    name: citation.name,
    url: citation.url,
    retrieved: describeRefreshedAt(citation.retrievedAt, locale),
  }));
  return {
    country,
    positioning: {
      badges: dto.standing.map((entry) => ({ scope: entry.scope, text: tierBadge(entry, areaOf(entry, country), locale, t) })),
      insights,
      equivalences: dto.nationalityEquivalences.map((equivalence) => describeEquivalence(equivalence, locale, t)),
      unavailable: [t('benchmark.unavailable')],
    },
    income,
    areaFigures,
    sources,
    housing,
    purchasingPower,
    gaps: dto.gaps.map((gap) => t(GAP_REASONS[gap])),
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
