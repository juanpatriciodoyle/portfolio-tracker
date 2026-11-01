import { describe, expect, it } from 'vitest';
import { makeEntry } from '../../../test/fixtures';
import { buildComparisonTable, relativeSpread, SIGNIFICANT_DIFFERENCE } from '../comparisonTable';

const lisbon = makeEntry({ phaseId: 'p2', city: 'Lisbon', countryCode: 'PT', startDate: '2020-01-01', monthlyFixedCostsMinor: 125000 });
const madrid = makeEntry({ phaseId: 'p1', city: 'Madrid', countryCode: 'ES', startDate: '2022-09-01' });

const rowsOf = (...entries: Parameters<typeof buildComparisonTable>[0]) => {
  const table = buildComparisonTable(entries, 'en-GB');
  if (table.kind !== 'table') throw new Error('expected a table');
  return table;
};

describe('relativeSpread', () => {
  it('is the gap as a share of the largest figure', () => {
    expect(relativeSpread([100, 50])).toBe(0.5);
    expect(relativeSpread([-100, 100])).toBe(2);
  });

  it('is zero for equal figures, zeros and single values', () => {
    expect(relativeSpread([7, 7, 7])).toBe(0);
    expect(relativeSpread([0, 0])).toBe(0);
    expect(relativeSpread([5])).toBe(0);
    expect(relativeSpread([])).toBe(0);
  });
});

describe('buildComparisonTable', () => {
  it('orders columns by start date and names homes by flag and city only', () => {
    const { columns } = rowsOf(madrid, lisbon);

    expect(columns).toEqual([
      { phaseId: 'p2', title: '🇵🇹 Lisbon' },
      { phaseId: 'p1', title: '🇪🇸 Madrid' },
    ]);
  });

  it('keeps only rows that differ by more than 5% and counts the rest', () => {
    const { rows, hiddenRows } = rowsOf(lisbon, madrid);

    expect(rows.map((row) => row.key)).toEqual(['fixed-costs']);
    expect(rows[0].cells).toEqual(['€1,250', '€1,500']);
    expect(hiddenRows).toBe(8); // income, left over, saved and the five categories that are alike
  });

  it('treats exactly 5% as not different enough', () => {
    const other = makeEntry({ phaseId: 'p3', startDate: '2021-01-01', monthlyIncomeMinor: 320000 * (1 - SIGNIFICANT_DIFFERENCE) });

    expect(rowsOf(madrid, other).rows.map((row) => row.key)).not.toContain('income');
    expect(rowsOf(madrid, { ...other, monthlyIncomeMinor: 320000 * 0.94 }).rows.map((row) => row.key)).toContain('income');
  });

  it('shows a category one home has and the other lacks, and hides one neither has', () => {
    const withGas = makeEntry({ phaseId: 'p3', startDate: '2021-01-01', fixedCostsByCategoryMinor: { ...madrid.fixedCostsByCategoryMinor, GAS: 4000 } });
    const keys = rowsOf(madrid, withGas).rows.map((row) => row.key);

    expect(keys).toContain('GAS');
    expect(keys).not.toContain('PHONE');
  });

  it('skips a savings rate a home does not have rather than treating it as zero', () => {
    const noIncome = makeEntry({ phaseId: 'p3', startDate: '2021-01-01', savingsRate: null });
    const saved = rowsOf(madrid, noIncome).rows.find((row) => row.key === 'saved');

    expect(saved).toBeUndefined();
    expect(rowsOf(madrid, noIncome).hiddenRows).toBeGreaterThan(0);
  });

  it('shows a dash for a missing rate when others differ', () => {
    const rich = makeEntry({ phaseId: 'p3', startDate: '2021-01-01', savingsRate: 0.2 });
    const noIncome = makeEntry({ phaseId: 'p4', startDate: '2022-01-01', savingsRate: null });

    expect(rowsOf(madrid, rich, noIncome).rows.find((row) => row.key === 'saved')?.cells).toEqual(['20%', '—', '53%']);
  });

  it('has no rows when the homes are alike', () => {
    expect(rowsOf(madrid, { ...madrid, phaseId: 'p9' }).rows).toEqual([]);
  });

  it('does not mix currencies', () => {
    const table = buildComparisonTable([madrid, { ...lisbon, currency: 'USD' }], 'en-GB');

    expect(table).toEqual({ kind: 'mixed-currencies', currencies: expect.arrayContaining(['EUR', 'USD']) });
  });
});
