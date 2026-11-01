import { describe, expect, it } from 'vitest';
import { makeCost, makePhase } from '../../../test/fixtures';
import { findRenewedCost } from '../costRenewal';

const phase = makePhase({
  fixedCosts: [makeCost({ id: 'internet', category: 'INTERNET', label: 'Digi fibre', amountMinor: 3000 }), makeCost({ id: 'rent', category: 'RENT', label: null })],
});
const rate = (overrides: Partial<Parameters<typeof findRenewedCost>[1]>) => ({ category: 'INTERNET' as const, cadence: 'MONTHLY' as const, amountMinor: 3500, label: 'digi Fibre', ...overrides });

describe('findRenewedCost', () => {
  it('finds the cost of the same category and name, ignoring case', () => {
    expect(findRenewedCost(phase, rate({}))?.id).toBe('internet');
  });

  it('is a new cost when the name or the category differ', () => {
    expect(findRenewedCost(phase, rate({ label: 'Movistar' }))).toBeUndefined();
    expect(findRenewedCost(phase, rate({ category: 'PHONE' }))).toBeUndefined();
  });

  it('is a new cost when the rate has no name', () => {
    expect(findRenewedCost(phase, rate({ label: undefined }))).toBeUndefined();
    expect(findRenewedCost(phase, { category: 'RENT', cadence: 'MONTHLY', amountMinor: 1 })).toBeUndefined();
  });
});
