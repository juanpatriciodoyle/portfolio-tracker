import { describe, expect, it } from 'vitest';
import { makeEntry } from '../../../test/fixtures';
import { burnRateMinor, housingBurden, incomeFigures } from '../phaseRatios';

describe('housingBurden', () => {
  it('is rent and utilities over income', () => {
    // 1200 rent + 150 electricity + 50 water = 1400 of 3200
    expect(housingBurden(makeEntry())).toBeCloseTo(0.4375);
  });

  it('leaves out internet, phone, subscriptions, taxes and other', () => {
    const entry = makeEntry({ fixedCostsByCategoryMinor: { ...makeEntry().fixedCostsByCategoryMinor, RENT: 0, ELECTRICITY: 0, WATER: 0, INTERNET: 9999, TAXES: 9999 } });
    expect(housingBurden(entry)).toBe(0);
  });

  it('is null when there is no income', () => {
    expect(housingBurden(makeEntry({ monthlyIncomeMinor: 0 }))).toBeNull();
  });

  it('can pass one hundred percent', () => {
    expect(housingBurden(makeEntry({ monthlyIncomeMinor: 100000 }))).toBeGreaterThan(1);
  });
});

describe('incomeFigures', () => {
  const entry = makeEntry({
    monthlyIncomeMinor: 400000,
    savingsCapacityMinor: 250000,
    savingsRate: 0.625,
    averageMonthlyIncomeMinor: 300000,
    averageSavingsCapacityMinor: 150000,
    averageSavingsRate: 0.5,
  });

  it('reads the income of today for the current rate', () => {
    expect(incomeFigures(entry, 'current')).toEqual({ incomeMinor: 400000, savingsCapacityMinor: 250000, savingsRate: 0.625 });
  });

  it('reads the average month of the stay for the phase average', () => {
    expect(incomeFigures(entry, 'average')).toEqual({ incomeMinor: 300000, savingsCapacityMinor: 150000, savingsRate: 0.5 });
  });
});

describe('burnRateMinor', () => {
  it('is what the fixed costs take each month when nothing comes in', () => {
    expect(burnRateMinor({ incomeMinor: 0, savingsCapacityMinor: -150000, savingsRate: null })).toBe(150000);
  });

  it('is null with income, even when it is not enough', () => {
    expect(burnRateMinor({ incomeMinor: 100000, savingsCapacityMinor: -50000, savingsRate: -0.5 })).toBeNull();
  });

  it('is null with neither income nor costs', () => {
    expect(burnRateMinor({ incomeMinor: 0, savingsCapacityMinor: 0, savingsRate: null })).toBeNull();
  });
});
