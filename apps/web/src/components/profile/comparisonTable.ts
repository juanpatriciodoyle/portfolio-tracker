import { FIXED_COST_CATEGORIES, type TimelineEntryDto } from '../../contracts';
import { flagEmoji } from '../../lib/countries';
import { displayLocale, formatMinor, formatPercent } from '../../lib/money';
import { CATEGORY_LABELS } from './labels';

/** A row is shown only when the compared homes differ by more than this share of the larger figure. */
export const SIGNIFICANT_DIFFERENCE = 0.05;

export const MIN_COMPARED_PHASES = 2;
export const MAX_COMPARED_PHASES = 4;

export interface ComparisonColumn {
  phaseId: string;
  /** "🇪🇸 Madrid": where the home is, with no street address. */
  title: string;
}

export interface ComparisonRow {
  key: string;
  label: string;
  /** One formatted figure per column, in column order. */
  cells: string[];
}

export type ComparisonTable =
  | { kind: 'table'; currency: string; columns: ComparisonColumn[]; rows: ComparisonRow[]; hiddenRows: number }
  | { kind: 'mixed-currencies'; currencies: string[] };

/** How far apart the figures are, as a share of the largest one in absolute terms: 0 when all are equal. */
export function relativeSpread(values: readonly number[]): number {
  const largest = Math.max(...values.map(Math.abs));
  if (values.length < 2 || largest === 0) return 0;
  return (Math.max(...values) - Math.min(...values)) / largest;
}

interface Measure {
  key: string;
  label: string;
  /** null: the home has no such figure (a savings rate with no income). */
  valueOf: (entry: TimelineEntryDto) => number | null;
  format: (value: number, currency: string, locale: string) => string;
}

const money = (value: number, currency: string, locale: string) => formatMinor(value, currency, locale);

const MEASURES: readonly Measure[] = [
  { key: 'income', label: 'Income', valueOf: (entry) => entry.monthlyIncomeMinor, format: money },
  { key: 'fixed-costs', label: 'Fixed costs', valueOf: (entry) => entry.monthlyFixedCostsMinor, format: money },
  { key: 'left-over', label: 'Left over', valueOf: (entry) => entry.savingsCapacityMinor, format: money },
  { key: 'saved', label: 'Saved', valueOf: (entry) => entry.savingsRate, format: (value, _currency, locale) => formatPercent(value, locale) },
  ...FIXED_COST_CATEGORIES.map(
    (category): Measure => ({
      key: category,
      label: CATEGORY_LABELS[category],
      valueOf: (entry) => entry.fixedCostsByCategoryMinor[category],
      format: money,
    })
  ),
];

/**
 * The chosen homes side by side, earliest first, keeping only rows where they differ by more than
 * {@link SIGNIFICANT_DIFFERENCE}. Homes in different currencies are not mixed here: amounts need a rate.
 */
export function buildComparisonTable(entries: readonly TimelineEntryDto[], locale: string = displayLocale()): ComparisonTable {
  const ordered = [...entries].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const currencies = [...new Set(ordered.map((entry) => entry.currency))];
  if (currencies.length > 1) return { kind: 'mixed-currencies', currencies };

  const currency = currencies[0] ?? 'EUR';
  const rows: ComparisonRow[] = [];
  let hiddenRows = 0;
  for (const measure of MEASURES) {
    const values = ordered.map(measure.valueOf);
    const present = values.filter((value): value is number => value !== null);
    if (present.every((value) => value === 0)) continue;
    if (present.length < 2 || relativeSpread(present) <= SIGNIFICANT_DIFFERENCE) {
      hiddenRows += 1;
      continue;
    }
    rows.push({
      key: measure.key,
      label: measure.label,
      cells: values.map((value) => (value === null ? '—' : measure.format(value, currency, locale))),
    });
  }

  return {
    kind: 'table',
    currency,
    columns: ordered.map((entry) => ({ phaseId: entry.phaseId, title: [flagEmoji(entry.countryCode), entry.city].filter(Boolean).join(' ') })),
    rows,
    hiddenRows,
  };
}
