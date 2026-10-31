import { describe, expect, it } from 'vitest';
import type { PhaseComparisonResponse } from '../../../contracts';
import { describeComparison } from '../describeComparison';

type Comparable = Extract<PhaseComparisonResponse, { comparable: true }>;

const comparable = (overrides: Partial<Comparable> = {}): Comparable => ({
  comparable: true,
  fromPhaseId: 'a',
  toPhaseId: 'b',
  currency: 'EUR',
  monthlyIncomeDeltaMinor: 0,
  monthlyFixedCostsDeltaMinor: 25000,
  savingsCapacityDeltaMinor: -25000,
  fixedCostsDeltaFraction: 0.1,
  categories: [],
  ...overrides,
});

const describe_ = (comparison: PhaseComparisonResponse) =>
  describeComparison({ fromName: 'Madrid', toName: 'Lisbon', comparison }, 'en-US');

describe('describeComparison', () => {
  it('says how much more the later home costs, and what that does to what is left over', () => {
    const result = describe_(comparable());

    expect(result).toMatchObject({
      kind: 'comparable',
      headline: 'Fixed costs in Lisbon are €250 more per month than in Madrid (10%).',
      leftOverLine: "You'd have €250 less left over each month.",
    });
  });

  it('says how much less when costs fall, and when more is left over', () => {
    const result = describe_(
      comparable({ monthlyFixedCostsDeltaMinor: -12000, savingsCapacityDeltaMinor: 12000, fixedCostsDeltaFraction: -0.08 })
    );

    expect(result).toMatchObject({
      headline: 'Fixed costs in Lisbon are €120 less per month than in Madrid (8%).',
      leftOverLine: "You'd have €120 more left over each month.",
    });
  });

  it('says the costs are the same when nothing changed, with no left-over line', () => {
    const result = describe_(
      comparable({ monthlyFixedCostsDeltaMinor: 0, savingsCapacityDeltaMinor: 0, fixedCostsDeltaFraction: 0 })
    );

    expect(result).toMatchObject({ headline: 'Fixed costs are the same in Lisbon and Madrid.', leftOverLine: null });
  });

  it('leaves the percentage out when the earlier home had no fixed costs', () => {
    const result = describe_(comparable({ fixedCostsDeltaFraction: null }));

    expect(result).toMatchObject({ headline: 'Fixed costs in Lisbon are €250 more per month than in Madrid.' });
  });

  it('shows a fraction of a percent to one decimal', () => {
    const result = describe_(comparable({ fixedCostsDeltaFraction: 0.12345 }));

    expect(result).toMatchObject({ headline: expect.stringContaining('(12.3%)') });
  });

  it('uses the comparison currency', () => {
    const result = describe_(comparable({ currency: 'USD' }));

    expect(result).toMatchObject({ headline: expect.stringContaining('$250') });
  });

  it('lists categories that changed, biggest change first, and skips ones that were never paid', () => {
    const result = describe_(
      comparable({
        categories: [
          { category: 'WATER', fromMinor: 4000, toMinor: 3000, deltaMinor: -1000 },
          { category: 'GAS', fromMinor: 0, toMinor: 0, deltaMinor: 0 },
          { category: 'INTERNET', fromMinor: 5000, toMinor: 5000, deltaMinor: 0 },
          { category: 'RENT', fromMinor: 100000, toMinor: 120000, deltaMinor: 20000 },
        ],
      })
    );

    expect(result.kind).toBe('comparable');
    if (result.kind !== 'comparable') return;
    expect(result.categories.map((line) => line.text)).toEqual([
      'Rent: €1,000 → €1,200 (+€200)',
      'Water: €40 → €30 (-€10)',
      'Internet: €50 (no change)',
    ]);
    expect(result.categories.map((line) => line.direction)).toEqual(['up', 'down', 'same']);
  });

  it('explains, kindly, that different currencies need exchange rates', () => {
    const result = describe_({ comparable: false, reason: 'FX_REQUIRED', currencies: ['EUR', 'ARS'] });

    expect(result.kind).toBe('not-comparable');
    expect(result.headline).toContain('EUR and ARS');
    expect(result.headline).toContain('exchange rates');
  });
});
