import { describe, expect, it } from 'vitest';
import { makeBill, makeCost, makePhase } from '../../../test/fixtures';
import { vendorHistory } from '../vendorHistory';

describe('vendorHistory', () => {
  it('lists the senders of logged bills, newest bill first', () => {
    const older = makeBill({ id: 'b1', vendor: 'Iberdrola', periodEnd: '2026-03-31' });
    const newer = makeBill({ id: 'b2', vendor: 'Endesa', category: 'GAS', cadence: 'MONTHLY', periodEnd: '2026-09-30' });

    expect(vendorHistory([], [older, newer])).toEqual([
      { vendor: 'Endesa', category: 'GAS', cadence: 'MONTHLY' },
      { vendor: 'Iberdrola', category: 'ELECTRICITY', cadence: 'BIMONTHLY' },
    ]);
  });

  it('adds the labelled costs declared in every phase, after the bills, and skips the unlabelled ones', () => {
    const phases = [
      makePhase({ id: 'p1', fixedCosts: [makeCost({ id: 'c1', category: 'INTERNET', label: 'Digi', cadence: 'MONTHLY' }), makeCost({ id: 'c2', label: null })] }),
      makePhase({ id: 'p2', fixedCosts: [makeCost({ id: 'c3', category: 'WATER', label: '  ', cadence: 'BIMONTHLY' }), makeCost({ id: 'c4', category: 'GAS', label: 'Naturgy', cadence: 'QUARTERLY' })] }),
    ];

    expect(vendorHistory(phases, [makeBill({ vendor: 'Iberdrola' })])).toEqual([
      { vendor: 'Iberdrola', category: 'ELECTRICITY', cadence: 'BIMONTHLY' },
      { vendor: 'Digi', category: 'INTERNET', cadence: 'MONTHLY' },
      { vendor: 'Naturgy', category: 'GAS', cadence: 'QUARTERLY' },
    ]);
  });

  it('is empty when nothing was declared or logged', () => {
    expect(vendorHistory([], [])).toEqual([]);
  });
});
