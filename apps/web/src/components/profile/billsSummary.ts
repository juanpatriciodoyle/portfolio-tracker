import type { BillingRecordDto, CostBasis, FixedCostCategory, TimelineEntryDto } from '../../contracts';
import { CATEGORY_GROUPS } from './labels';

/** One category of a home's costs, with what it costs a month, where that comes from and the bills behind it. */
export interface CategoryCostLine {
  category: FixedCostCategory;
  monthlyMinor: number;
  /** What the category would cost a month from the declared rates alone. */
  declaredMonthlyMinor: number;
  /** null when nothing was declared or billed for it. */
  basis: CostBasis | null;
  billCount: number;
  /** The bills of this category, newest first. */
  records: BillingRecordDto[];
}

export interface PhaseCostStats {
  totalMonthlyMinor: number;
  lines: CategoryCostLine[];
  billsCount: number;
  /** The first and last day any bill covers; null with no bills. */
  coveredFrom: string | null;
  coveredTo: string | null;
  /** How much the bills moved the monthly costs from what was declared, in the categories that have both; null when none does. */
  fromBillsVsDeclaredMinor: number | null;
}

const CATEGORY_ORDER = CATEGORY_GROUPS.flatMap((group) => group.categories);

const newestFirst = (a: BillingRecordDto, b: BillingRecordDto) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart);

/**
 * The plain picture of a home's costs for its bills screen: every number comes from the timeline entry (`effectiveCosts` already
 * worked it out), and the bills are only grouped and counted here.
 */
export function phaseCostStats(entry: TimelineEntryDto | undefined, records: readonly BillingRecordDto[]): PhaseCostStats {
  const starts = records.map((record) => record.periodStart).sort();
  const ends = records.map((record) => record.periodEnd).sort();

  const lines = entry
    ? CATEGORY_ORDER.map((category): CategoryCostLine => {
        const { basis, billCount } = entry.costBasisByCategory[category];
        return {
          category,
          monthlyMinor: entry.fixedCostsByCategoryMinor[category],
          declaredMonthlyMinor: entry.declaredCostsByCategoryMinor[category],
          basis,
          billCount,
          records: records.filter((record) => record.category === category).sort(newestFirst),
        };
      }).filter((line) => line.monthlyMinor !== 0 || line.declaredMonthlyMinor !== 0 || line.basis !== null || line.records.length > 0)
    : [];

  const bothDeclaredAndBilled = lines.filter((line) => (line.basis === 'BILLS' || line.basis === 'MIXED') && line.declaredMonthlyMinor > 0);

  return {
    totalMonthlyMinor: entry?.monthlyFixedCostsMinor ?? 0,
    lines,
    billsCount: records.length,
    coveredFrom: starts[0] ?? null,
    coveredTo: ends[ends.length - 1] ?? null,
    fromBillsVsDeclaredMinor: bothDeclaredAndBilled.length === 0 ? null : bothDeclaredAndBilled.reduce((sum, line) => sum + line.monthlyMinor - line.declaredMonthlyMinor, 0),
  };
}
