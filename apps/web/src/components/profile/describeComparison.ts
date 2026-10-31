import type { FixedCostCategory, PhaseComparisonResponse } from '../../contracts';
import { displayLocale, formatMinor, formatPercent, formatSignedMinor } from '../../lib/money';
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
  locale: string = displayLocale()
): ComparisonDescription {
  if (!comparison.comparable) {
    const [first, second] = comparison.currencies;
    return {
      kind: 'not-comparable',
      headline: `These two homes use different currencies (${first} and ${second}) and no exchange rate is available for them right now. Try again a little later.`,
    };
  }

  const { currency } = comparison;
  const costDelta = comparison.monthlyFixedCostsDeltaMinor;
  const percent =
    comparison.fixedCostsDeltaFraction === null ? '' : ` (${formatPercent(Math.abs(comparison.fixedCostsDeltaFraction), locale, 1)})`;

  const headline =
    costDelta === 0
      ? `Fixed costs are the same in ${toName} and ${fromName}.`
      : `Fixed costs in ${toName} are ${formatMinor(Math.abs(costDelta), currency, locale)} ${costDelta > 0 ? 'more' : 'less'} per month than in ${fromName}${percent}.`;

  const leftOver = comparison.savingsCapacityDeltaMinor;
  const leftOverLine =
    leftOver === 0
      ? null
      : `You'd have ${formatMinor(Math.abs(leftOver), currency, locale)} ${leftOver > 0 ? 'more' : 'less'} left over each month.`;

  const categories = comparison.categories
    .filter((entry) => entry.fromMinor !== 0 || entry.toMinor !== 0)
    .map((entry): CategoryChange => {
      const label = CATEGORY_LABELS[entry.category];
      if (entry.deltaMinor === 0) {
        return { category: entry.category, label, text: `${label}: ${formatMinor(entry.toMinor, currency, locale)} (no change)`, direction: 'same' };
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
  const rates = sources.map((entry): RateLabel => ({ currency: entry.currency, label: RATE_SOURCE_LABELS[entry.source] }));
  return { kind: 'comparable', headline, leftOverLine, categories, conversionNote: describeConversion(currency, sources), rates };
}

/** "Amounts shown in ARS, converted at the official rate." Names each currency's rate when they differ. */
function describeConversion(
  currency: string,
  sources: readonly { currency: string; source: keyof typeof RATE_SOURCE_PHRASES }[]
): string | null {
  if (sources.length === 0) return null;
  const distinct = [...new Set(sources.map((entry) => RATE_SOURCE_PHRASES[entry.source]))];
  const used =
    distinct.length === 1
      ? distinct[0]
      : sources.map((entry) => `${RATE_SOURCE_PHRASES[entry.source]} for ${entry.currency}`).join(' and ');
  return `Amounts shown in ${currency}, converted at ${used}.`;
}

function magnitude(comparison: Extract<PhaseComparisonResponse, { comparable: true }>, category: FixedCostCategory): number {
  return Math.abs(comparison.categories.find((entry) => entry.category === category)?.deltaMinor ?? 0);
}
