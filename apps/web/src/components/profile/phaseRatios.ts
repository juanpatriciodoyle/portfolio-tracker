import { UTILITY_CATEGORIES, type TimelineEntryDto } from '../../contracts';

/** Share of income a home takes, as a fraction: rent plus utilities over the monthly income. Null with no income to compare with. */
export function housingBurden(entry: Pick<TimelineEntryDto, 'monthlyIncomeMinor' | 'fixedCostsByCategoryMinor'>): number | null {
  if (!(entry.monthlyIncomeMinor > 0)) return null;
  const housingMinor = [...UTILITY_CATEGORIES, 'RENT' as const].reduce((sum, category) => sum + entry.fixedCostsByCategoryMinor[category], 0);
  return housingMinor / entry.monthlyIncomeMinor;
}

/** Which income a phase card reasons from: the streams paying today, or an average month of the whole stay. */
export type IncomeView = 'current' | 'average';

export interface IncomeFigures {
  incomeMinor: number;
  savingsCapacityMinor: number;
  /** Null when there is no income to take a share of. */
  savingsRate: number | null;
}

export function incomeFigures(entry: TimelineEntryDto, view: IncomeView): IncomeFigures {
  return view === 'current'
    ? { incomeMinor: entry.monthlyIncomeMinor, savingsCapacityMinor: entry.savingsCapacityMinor, savingsRate: entry.savingsRate }
    : { incomeMinor: entry.averageMonthlyIncomeMinor, savingsCapacityMinor: entry.averageSavingsCapacityMinor, savingsRate: entry.averageSavingsRate };
}

/** What a month costs when nothing comes in: the fixed costs, as a positive amount. Null whenever there is income. */
export function burnRateMinor({ incomeMinor, savingsCapacityMinor }: IncomeFigures): number | null {
  return incomeMinor === 0 && savingsCapacityMinor < 0 ? -savingsCapacityMinor : null;
}
