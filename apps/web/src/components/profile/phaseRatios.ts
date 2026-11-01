import { UTILITY_CATEGORIES, type TimelineEntryDto } from '../../contracts';

/** Share of income a home takes, as a fraction: rent plus utilities over the monthly income. Null with no income to compare with. */
export function housingBurden(entry: Pick<TimelineEntryDto, 'monthlyIncomeMinor' | 'fixedCostsByCategoryMinor'>): number | null {
  if (!(entry.monthlyIncomeMinor > 0)) return null;
  const housingMinor = [...UTILITY_CATEGORIES, 'RENT' as const].reduce((sum, category) => sum + entry.fixedCostsByCategoryMinor[category], 0);
  return housingMinor / entry.monthlyIncomeMinor;
}
