import { describe, expect, it } from 'vitest';
import type { BillingRecordDto } from '../../../contracts';
import { makeEntry, noBasis } from '../../../test/fixtures';
import { phaseCostStats } from '../billsSummary';

const bill = (overrides: Partial<BillingRecordDto> & Pick<BillingRecordDto, 'id' | 'category' | 'periodStart' | 'periodEnd' | 'amountMinor'>): BillingRecordDto => ({
  phaseId: 'p1',
  notes: null,
  cadence: 'MONTHLY',
  vendor: 'Iberdrola',
  currency: 'EUR',
  ...overrides,
});

const electricity = [
  bill({ id: 'b1', category: 'ELECTRICITY', periodStart: '2026-08-01', periodEnd: '2026-08-31', amountMinor: 6845 }),
  bill({ id: 'b2', category: 'ELECTRICITY', periodStart: '2026-09-01', periodEnd: '2026-09-30', amountMinor: 6120 }),
];
const internet = [bill({ id: 'b3', category: 'INTERNET', periodStart: '2026-09-01', periodEnd: '2026-09-30', amountMinor: 5200, vendor: 'Movistar' })];

describe('phaseCostStats', () => {
  const entry = makeEntry({
    monthlyFixedCostsMinor: 160000,
    fixedCostsByCategoryMinor: { ...makeEntry().fixedCostsByCategoryMinor, ELECTRICITY: 6483, INTERNET: 5200 },
    declaredCostsByCategoryMinor: { ...makeEntry().declaredCostsByCategoryMinor, ELECTRICITY: 0, INTERNET: 4500 },
    costBasisByCategory: noBasis({ ELECTRICITY: { basis: 'BILLS', billCount: 2 }, INTERNET: { basis: 'BILLS', billCount: 1 }, RENT: { basis: 'DECLARED', billCount: 0 } }),
  });

  it('counts the bills and the days they cover', () => {
    const stats = phaseCostStats(entry, [...electricity, ...internet]);
    expect(stats.billsCount).toBe(3);
    expect(stats.coveredFrom).toBe('2026-08-01');
    expect(stats.coveredTo).toBe('2026-09-30');
  });

  it('reads the monthly total from the entry, never adds it up again', () => {
    expect(phaseCostStats(entry, electricity).totalMonthlyMinor).toBe(160000);
  });

  it('lists each category that costs something, with what it is based on and its own bills, newest first', () => {
    const stats = phaseCostStats(entry, [...electricity, ...internet]);
    const power = stats.lines.find((line) => line.category === 'ELECTRICITY')!;
    expect(power).toMatchObject({ monthlyMinor: 6483, basis: 'BILLS', billCount: 2 });
    expect(power.records.map((record) => record.id)).toEqual(['b2', 'b1']);
    expect(stats.lines.find((line) => line.category === 'RENT')).toMatchObject({ basis: 'DECLARED', records: [] });
  });

  it('leaves out categories with nothing declared, billed or costing anything', () => {
    const categories = phaseCostStats(entry, electricity).lines.map((line) => line.category);
    expect(categories).not.toContain('PHONE');
    expect(categories).not.toContain('OTHER');
  });

  it('keeps categories in the order the app lists them everywhere: rent, utilities, internet and phone, the rest', () => {
    const categories = phaseCostStats(entry, [...electricity, ...internet]).lines.map((line) => line.category);
    expect(categories.slice(0, 3)).toEqual(['RENT', 'ELECTRICITY', 'WATER']);
  });

  it('says how far the bills moved the costs from what was declared, where both exist', () => {
    // internet: bills say 52.00, declared 45.00; electricity has nothing declared, so it says nothing about a difference
    expect(phaseCostStats(entry, [...electricity, ...internet]).fromBillsVsDeclaredMinor).toBe(700);
    const internetLine = phaseCostStats(entry, internet).lines.find((line) => line.category === 'INTERNET')!;
    expect(internetLine.declaredMonthlyMinor).toBe(4500);
  });

  it('has no difference to report when nothing was both declared and billed', () => {
    const declaredOnly = makeEntry();
    expect(phaseCostStats(declaredOnly, []).fromBillsVsDeclaredMinor).toBeNull();
    expect(phaseCostStats(declaredOnly, []).billsCount).toBe(0);
    expect(phaseCostStats(declaredOnly, []).coveredFrom).toBeNull();
  });

  it('is empty and calm for a phase with no entry yet', () => {
    expect(phaseCostStats(undefined, electricity)).toMatchObject({ totalMonthlyMinor: 0, billsCount: 2, lines: [] });
  });
});
