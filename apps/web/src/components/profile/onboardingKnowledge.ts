import type { BenchmarkPreviewResponse } from '../../contracts';
import { currentTranslator, type Translate } from '../../i18n/translate';
import { currencyExponent, displayLocale, formatMinor } from '../../lib/money';
import { SOURCE_LABELS } from './describeBenchmarks';

/** One line of what we already know while the person answers, and where the figure comes from (shown quietly beside it). */
export interface Known {
  text: string;
  source: string | null;
}

const sourceOf = ({ source, period }: { source: keyof typeof SOURCE_LABELS; period: string }) => `${SOURCE_LABELS[source]} · ${period}`;

const percent = (value: number, locale: string, digits = 1) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)}%`;

/** What the typical person of the country has to live on each month after tax. */
export function knownAboutCountry(preview: BenchmarkPreviewResponse | null, country: string, locale: string = displayLocale(), t: Translate = currentTranslator()): Known | null {
  const typical = preview?.typicalMonthlyIncome;
  if (!typical) return null;
  // "About": whole units, never the cents of a statistic.
  const unit = 10 ** currencyExponent(typical.currency);
  return { text: t('know.country', { country, amount: formatMinor(Math.round(typical.amountMinor / unit) * unit, typical.currency, locale) }), source: sourceOf(typical) };
}

/** How many people of the country live on less than the income typed. Neutral: a place, not a grade. */
export function knownAboutIncome(preview: BenchmarkPreviewResponse | null, country: string, locale: string = displayLocale(), t: Translate = currentTranslator()): Known | null {
  const position = preview?.incomePercentile;
  if (!position) return null;
  const key = position.bound === 'AT_LEAST' ? 'know.incomeAtLeast' : position.bound === 'AT_MOST' ? 'know.incomeAtMost' : 'know.income';
  return { text: t(key, { country, percent: percent(Math.round(position.percentile), locale, 0) }), source: sourceOf(position) };
}

/**
 * The rent against the income, and against what people who pay rent typically spend when that is published.
 * `shareOfIncome` is only for when nothing is published to compare with: the share is still a fact worth saying.
 */
export function knownAboutRent(
  preview: BenchmarkPreviewResponse | null,
  country: string,
  locale: string = displayLocale(),
  t: Translate = currentTranslator(),
  shareOfIncome?: number
): Known | null {
  if (preview?.rent) {
    return {
      text: t('know.rent', { share: percent(preview.rent.yourSharePercent, locale), country, typical: percent(preview.rent.typicalSharePercent, locale) }),
      source: sourceOf(preview.rent),
    };
  }
  return shareOfIncome === undefined ? null : { text: t('know.rentOnly', { share: percent(shareOfIncome * 100, locale) }), source: null };
}
