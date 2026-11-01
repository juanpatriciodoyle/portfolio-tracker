import { describe, expect, it } from 'vitest';
import { describeCostBasis, describeDeclaredCadence } from '../describeCosts';

describe('describeCostBasis', () => {
  it('says nothing for a cost that was only declared or is absent', () => {
    expect(describeCostBasis('RENT', 'DECLARED', 0)).toBeNull();
    expect(describeCostBasis('RENT', null, 0)).toBeNull();
  });

  it('calls a variable cost the average of the bills logged for the home', () => {
    expect(describeCostBasis('ELECTRICITY', 'BILLS', 1)).toBe('Average of 1 bill');
    expect(describeCostBasis('WATER', 'BILLS', 3)).toBe('Average of 3 bills');
    expect(describeCostBasis('HEATING_COOLING', 'BILLS', 2)).toBe('Average of 2 bills');
    expect(describeCostBasis('TAXES', 'BILLS', 2)).toBe('Average of 2 bills');
  });

  it('calls a fixed cost the average of its latest bills', () => {
    expect(describeCostBasis('INTERNET', 'BILLS', 1)).toBe('From your latest bill');
    expect(describeCostBasis('INTERNET', 'BILLS', 3)).toBe('From your latest 3 bills');
  });

  it('mentions the declared costs that still count next to the bills', () => {
    expect(describeCostBasis('SUBSCRIPTIONS', 'MIXED', 2)).toBe('From your latest 2 bills and what you declared');
  });
});

describe('describeDeclaredCadence', () => {
  it('reads after an amount: every 2 months, every 3 months, every year', () => {
    expect(describeDeclaredCadence('WATER', 'BIMONTHLY')).toBe('every 2 months');
    expect(describeDeclaredCadence('GAS', 'QUARTERLY')).toBe('every 3 months');
    expect(describeDeclaredCadence('RENT', 'ANNUAL')).toBe('every year');
  });

  it('never says "every year" next to taxes', () => {
    expect(describeDeclaredCadence('TAXES', 'ANNUAL')).toBeNull();
    expect(describeDeclaredCadence('TAXES', 'MONTHLY')).toBeNull();
  });
});
