import { FIXED_COST_CATEGORIES } from '../contracts';
import {
  MONTHS_PER_PAYMENT,
  baselineSavingsCapacity,
  monthlyBurnByCategory,
  monthlyFixedCostBurn,
  type FixedCost,
} from '../domain/fixedCosts';

const cost = (
  category: FixedCost['category'],
  cadence: FixedCost['cadence'],
  amountMinor: number
): FixedCost => ({ category, cadence, amountMinor });

describe('MONTHS_PER_PAYMENT', () => {
  it('covers one, two, three and twelve months per payment', () => {
    expect(MONTHS_PER_PAYMENT).toEqual({ MONTHLY: 1, BIMONTHLY: 2, QUARTERLY: 3, ANNUAL: 12 });
  });
});

describe('monthlyFixedCostBurn', () => {
  it('is zero without costs and for zero-amount costs', () => {
    expect(monthlyFixedCostBurn([])).toBe(0);
    expect(monthlyFixedCostBurn([cost('RENT', 'MONTHLY', 0)])).toBe(0);
  });

  it.each<[string, FixedCost, number]>([
    ['a monthly bill counts as is', cost('RENT', 'MONTHLY', 120000), 120000],
    ['a bimonthly bill is half per month', cost('ELECTRICITY', 'BIMONTHLY', 9600), 4800],
    ['a quarterly bill is a third per month', cost('WATER', 'QUARTERLY', 9000), 3000],
    ['an annual bill is a twelfth per month', cost('TAXES', 'ANNUAL', 36000), 3000],
  ])('%s', (_label, item, expected) => {
    expect(monthlyFixedCostBurn([item])).toBe(expected);
  });

  it('adds up a realistic mix of cadences', () => {
    const burn = monthlyFixedCostBurn([
      cost('RENT', 'MONTHLY', 120000), //   120,000
      cost('ELECTRICITY', 'BIMONTHLY', 9600), //   4,800
      cost('WATER', 'QUARTERLY', 4500), //   1,500
      cost('TAXES', 'ANNUAL', 36000), //   3,000
    ]);

    expect(burn).toBe(129300);
  });

  it('rounds once, at the end, not per item', () => {
    // Three annual bills of 100: each is 8.33 a month, but together they are exactly 25.
    const annual = (n: number) => cost('SUBSCRIPTIONS', 'ANNUAL', n);

    expect(monthlyFixedCostBurn([annual(100), annual(100), annual(100)])).toBe(25);
  });

  it.each([
    [5, 0], //  0.4167 rounds down
    [6, 1], //  0.5 rounds away from zero
    [18, 2], // 1.5 rounds away from zero
  ])('rounds a single annual bill of %d minor units to %d a month', (annualAmount, expected) => {
    expect(monthlyFixedCostBurn([cost('TAXES', 'ANNUAL', annualAmount)])).toBe(expected);
  });

  it('does not depend on the order of the costs', () => {
    const costs = [
      cost('RENT', 'MONTHLY', 99999),
      cost('GAS', 'BIMONTHLY', 12345),
      cost('WATER', 'QUARTERLY', 777),
      cost('TAXES', 'ANNUAL', 54321),
    ];

    expect(monthlyFixedCostBurn([...costs].reverse())).toBe(monthlyFixedCostBurn(costs));
  });

  it('stays exact for very large amounts', () => {
    const big = 1_000_000_000_000;

    expect(monthlyFixedCostBurn([cost('RENT', 'MONTHLY', big), cost('TAXES', 'ANNUAL', big)])).toBe(
      big + Math.round(big / 12)
    );
  });

  it('does not mutate its input', () => {
    const costs = Object.freeze([Object.freeze(cost('RENT', 'MONTHLY', 100))]);

    expect(() => monthlyFixedCostBurn(costs)).not.toThrow();
  });
});

describe('monthlyBurnByCategory', () => {
  it('lists every category, with zero for the unused ones', () => {
    const byCategory = monthlyBurnByCategory([cost('RENT', 'MONTHLY', 100000)]);

    expect(Object.keys(byCategory)).toEqual([...FIXED_COST_CATEGORIES]);
    expect(byCategory.RENT).toBe(100000);
    expect(byCategory.GAS).toBe(0);
  });

  it('sums categories of the same kind together', () => {
    const byCategory = monthlyBurnByCategory([
      cost('SUBSCRIPTIONS', 'MONTHLY', 1299),
      cost('SUBSCRIPTIONS', 'ANNUAL', 12000),
    ]);

    expect(byCategory.SUBSCRIPTIONS).toBe(2299);
  });

  it('shares out rounding so the categories always add up to the total', () => {
    // Each of these is 8.33 a month; the total is 25, so exactly one category takes the extra unit.
    const byCategory = monthlyBurnByCategory([
      cost('RENT', 'ANNUAL', 100),
      cost('ELECTRICITY', 'ANNUAL', 100),
      cost('GAS', 'ANNUAL', 100),
    ]);

    expect(byCategory.RENT).toBe(9);
    expect(byCategory.ELECTRICITY).toBe(8);
    expect(byCategory.GAS).toBe(8);
  });

  it('always adds up to monthlyFixedCostBurn, whatever the mix', () => {
    let seed = 20261031;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    const cadences = Object.keys(MONTHS_PER_PAYMENT) as FixedCost['cadence'][];

    for (let run = 0; run < 500; run++) {
      const costs = Array.from({ length: 1 + Math.floor(random() * 12) }, () =>
        cost(
          FIXED_COST_CATEGORIES[Math.floor(random() * FIXED_COST_CATEGORIES.length)],
          cadences[Math.floor(random() * cadences.length)],
          Math.floor(random() * 500000)
        )
      );
      const byCategory = monthlyBurnByCategory(costs);
      const sum = Object.values(byCategory).reduce((total, value) => total + value, 0);

      expect(sum).toBe(monthlyFixedCostBurn(costs));
    }
  });
});

describe('baselineSavingsCapacity', () => {
  it('is income minus fixed costs, with the savings rate as a fraction of income', () => {
    expect(baselineSavingsCapacity({ monthlyIncomeMinor: 320000, monthlyFixedCostsMinor: 150000 })).toEqual({
      capacityMinor: 170000,
      savingsRate: 0.53125,
    });
  });

  it('is zero when income exactly covers the costs', () => {
    expect(baselineSavingsCapacity({ monthlyIncomeMinor: 100000, monthlyFixedCostsMinor: 100000 })).toEqual({
      capacityMinor: 0,
      savingsRate: 0,
    });
  });

  it('goes negative when the costs exceed income', () => {
    expect(baselineSavingsCapacity({ monthlyIncomeMinor: 100000, monthlyFixedCostsMinor: 150000 })).toEqual({
      capacityMinor: -50000,
      savingsRate: -0.5,
    });
  });

  it('has no savings rate without income', () => {
    expect(baselineSavingsCapacity({ monthlyIncomeMinor: 0, monthlyFixedCostsMinor: 80000 })).toEqual({
      capacityMinor: -80000,
      savingsRate: null,
    });
    expect(baselineSavingsCapacity({ monthlyIncomeMinor: 0, monthlyFixedCostsMinor: 0 })).toEqual({
      capacityMinor: 0,
      savingsRate: null,
    });
  });
});
