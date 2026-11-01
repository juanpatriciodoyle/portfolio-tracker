import { describe, expect, it } from 'vitest';
import { makeEntry } from '../../../test/fixtures';
import { housingBurden } from '../phaseRatios';

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
