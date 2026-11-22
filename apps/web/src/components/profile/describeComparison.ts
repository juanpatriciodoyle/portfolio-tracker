import type { FixedCostCategory, PhaseComparisonResponse } from '../../contracts';
import { displayLocale, formatMinor, formatPercent, formatSignedMinor } from '../../lib/money';
import { currentTranslator, type Translate } from '../../i18n/translate';
import { CATEGORY_LABELS, RATE_SOURCE_LABELS, RATE_SOURCE_PHRASES } from './labels';

export interface CategoryChange {
  category: FixedCostCategory;
  label: string;
  text: string;
  direction: 'up' | 'down' | 'same';
}

export interface RateLabel {
  currency: string;
  /** "Official rate", "ECB rate" or "Approximate rate". */
  label: string;
}

export type ComparisonDescription =
  | {
      kind: 'comparable';
      headline: string;
      leftOverLine: string | null;
      categories: CategoryChange[];
      /** Said when currencies were converted: "Amounts shown in ARS, converted at the official rate." */
      conversionNote: string | null;
      rates: RateLabel[];
    }
  | { kind: 'not-comparable'; headline: string };

interface DescribeInput {
  /** The earlier phase: the comparison's deltas are measured from it. */
  fromName: string;
  toName: string;
  comparison: PhaseComparisonResponse;
}

/** Turns the server's numbers into plain sentences. Wording only: no maths beyond showing a size. */
export function describeComparison(
  { fromName, toName, comparison }: DescribeInput,
  locale: string = displayLocale(),
  t: Translate = currentTranslator()
): ComparisonDescription {
  if (!comparison.comparable) {
    const [first, second] = comparison.currencies;
    return {
      kind: 'not-comparable',
      headline: t('compare.differentCurrencies', { first, second }),
    };
  }

  const { currency } = comparison;
  const costDelta = comparison.monthlyFixedCostsDeltaMinor;
  const percent =
    comparison.fixedCostsDeltaFraction === null ? '' : ` (${formatPercent(Math.abs(comparison.fixedCostsDeltaFraction), locale, 1)})`;

  const headline =
    costDelta === 0
      ? t('compare.same', { to: toName, from: fromName })
      : t(costDelta > 0 ? 'compare.more' : 'compare.less', { to: toName, from: fromName, amount: formatMinor(Math.abs(costDelta), currency, locale), percent });

  const leftOver = comparison.savingsCapacityDeltaMinor;
  const leftOverLine =
    leftOver === 0
      ? null
      : t(leftOver > 0 ? 'compare.leftMore' : 'compare.leftLess', { amount: formatMinor(Math.abs(leftOver), currency, locale) });

  const categories = comparison.categories
    .filter((entry) => entry.fromMinor !== 0 || entry.toMinor !== 0)
    .map((entry): CategoryChange => {
      const label = t(CATEGORY_LABELS[entry.category]);
      if (entry.deltaMinor === 0) {
        return { category: entry.category, label, text: t('compare.noChange', { label, amount: formatMinor(entry.toMinor, currency, locale) }), direction: 'same' };
      }
      return {
        category: entry.category,
        label,
        text: `${label}: ${formatMinor(entry.fromMinor, currency, locale)} → ${formatMinor(entry.toMinor, currency, locale)} (${formatSignedMinor(entry.deltaMinor, currency, locale)})`,
        direction: entry.deltaMinor > 0 ? 'up' : 'down',
      };
    })
    .sort((a, b) => magnitude(comparison, b.category) - magnitude(comparison, a.category));

  const sources = comparison.rateSources ?? [];
  const rates = sources.map((entry): RateLabel => ({ currency: entry.currency, label: t(RATE_SOURCE_LABELS[entry.source]) }));
  return { kind: 'comparable', headline, leftOverLine, categories, conversionNote: describeConversion(currency, sources, t), rates };
}

/** "Amounts shown in ARS, converted at the official rate." Names each currency's rate when they differ. */
function describeConversion(
  currency: string,
  sources: readonly { currency: string; source: keyof typeof RATE_SOURCE_PHRASES }[],
  t: Translate
): string | null {
  if (sources.length === 0) return null;
  const distinct = [...new Set(sources.map((entry) => t(RATE_SOURCE_PHRASES[entry.source])))];
  const used =
    distinct.length === 1
      ? distinct[0]
      : sources.map((entry) => t('compare.conversionFor', { rate: t(RATE_SOURCE_PHRASES[entry.source]), currency: entry.currency })).join(t('compare.and'));
  return t('compare.conversion', { currency, used });
}

function magnitude(comparison: Extract<PhaseComparisonResponse, { comparable: true }>, category: FixedCostCategory): number {
  return Math.abs(comparison.categories.find((entry) => entry.category === category)?.deltaMinor ?? 0);
}
