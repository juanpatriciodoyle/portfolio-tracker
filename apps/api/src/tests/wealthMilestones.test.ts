import { DEFAULT_CAPITAL_REQUIRED_PERCENTAGE, FIXED_COST_CATEGORIES, type CapitalMilestone, type FixedCostCategory } from '../contracts';
import {
  CONSERVATIVE_REAL_YIELD,
  capitalMilestonePacing,
  capitalNeededMinor,
  secondSalaryMinor,
  wealthMilestones,
} from '../domain/wealthMilestones';

const costs = (partial: Partial<Record<FixedCostCategory, number>>): Record<FixedCostCategory, number> =>
  Object.fromEntries(FIXED_COST_CATEGORIES.map((category) => [category, partial[category] ?? 0])) as Record<FixedCostCategory, number>;

// 300 € utilities and subscriptions, 900 € rent, 1,500 € in all (the rest is taxes and other).
const MADRID = costs({ RENT: 90_000, ELECTRICITY: 8_000, GAS: 4_000, WATER: 3_000, INTERNET: 5_000, SUBSCRIPTIONS: 10_000, TAXES: 20_000, OTHER: 10_000 });

describe('secondSalaryMinor', () => {
  it('is the capital times the conservative real yield, spread over twelve months', () => {
    expect(CONSERVATIVE_REAL_YIELD).toBe(0.06);
    expect(secondSalaryMinor(100_000_00)).toBe(50_000); // €100,000 -> €500 / month
  });

  it.each([
    ['zero capital', 0, 0],
    ['negative capital (the portfolio owes more than it holds)', -5_000_00, 0],
    ['rounds half away from zero to a whole cent', 100, 1], // 0.5 cent
    ['a fraction below half a cent', 99, 0],
  ])('%s', (_label, capital, expected) => {
    expect(secondSalaryMinor(capital)).toBe(expected);
  });

  it('takes another yield when one is passed', () => {
    expect(secondSalaryMinor(120_000_00, 0.04)).toBe(40_000);
  });
});

describe('capitalNeededMinor', () => {
  it('is the capital whose second salary just reaches the amount', () => {
    expect(capitalNeededMinor(300_000)).toBe(600_000_00); // €3,000 / month needs €600,000
  });

  it('always rounds up so the capital really reaches the amount', () => {
    for (const monthly of [1, 333, 123_457]) expect(secondSalaryMinor(capitalNeededMinor(monthly))).toBeGreaterThanOrEqual(monthly);
  });

  it('needs nothing for nothing', () => {
    expect(capitalNeededMinor(0)).toBe(0);
  });
});

describe('wealthMilestones', () => {
  it('reports the second salary of the capital', () => {
    expect(wealthMilestones({ targetMonthlyMinor: null, capitalMinor: 100_000_00, costsByCategoryMinor: MADRID }).secondSalaryMinor).toBe(50_000);
  });

  it('works out each milestone from the categories of the monthly costs', () => {
    const { milestones } = wealthMilestones({ targetMonthlyMinor: null, capitalMinor: 0, costsByCategoryMinor: MADRID });
    expect(milestones.map(({ id, kind, monthlyCostMinor }) => ({ id, kind, monthlyCostMinor }))).toEqual([
      { id: 1, kind: 'UTILITIES_AND_SUBSCRIPTIONS', monthlyCostMinor: 30_000 },
      { id: 2, kind: 'RENT', monthlyCostMinor: 90_000 },
      { id: 3, kind: 'LIVING_COST', monthlyCostMinor: 150_000 },
    ]);
  });

  it('reaches no milestone with no capital, and says how far the first is', () => {
    const result = wealthMilestones({ targetMonthlyMinor: null, capitalMinor: 0, costsByCategoryMinor: MADRID });
    expect(result.reachedMilestone).toBeNull();
    expect(result.milestones.every(({ reached }) => !reached)).toBe(true);
    expect(result.milestones[0].progress).toBe(0);
  });

  it('reaches the first milestone exactly when the second salary equals the cost', () => {
    const exact = capitalNeededMinor(30_000);
    expect(wealthMilestones({ targetMonthlyMinor: null, capitalMinor: exact, costsByCategoryMinor: MADRID }).reachedMilestone).toBe(1);
    const justShort = wealthMilestones({ targetMonthlyMinor: null, capitalMinor: exact - 1_000,costsByCategoryMinor: MADRID });
    expect(justShort.reachedMilestone).toBeNull();
    expect(justShort.milestones[0].progress).toBeLessThan(1);
  });

  it('names the highest milestone reached', () => {
    expect(wealthMilestones({ targetMonthlyMinor: null, capitalMinor: capitalNeededMinor(90_000), costsByCategoryMinor: MADRID }).reachedMilestone).toBe(2);
    expect(wealthMilestones({ targetMonthlyMinor: null, capitalMinor: capitalNeededMinor(150_000), costsByCategoryMinor: MADRID }).reachedMilestone).toBe(3);
  });

  it('records the capital each milestone needs', () => {
    const { milestones } = wealthMilestones({ targetMonthlyMinor: null, capitalMinor: 0, costsByCategoryMinor: MADRID });
    expect(milestones.map(({ capitalNeededMinor: needed }) => needed)).toEqual([capitalNeededMinor(30_000), capitalNeededMinor(90_000), capitalNeededMinor(150_000)]);
  });

  it('leaves out a milestone whose cost is nothing: covering nothing is no achievement', () => {
    const { milestones, reachedMilestone } = wealthMilestones({ targetMonthlyMinor: null, capitalMinor: 1_000_000_00, costsByCategoryMinor: costs({ RENT: 80_000 }) });
    expect(milestones.map(({ id }) => id)).toEqual([2, 3]);
    expect(reachedMilestone).toBe(3);
  });

  it('has no milestones when no cost is known, and still shows the second salary', () => {
    const result = wealthMilestones({ targetMonthlyMinor: null, capitalMinor: 100_000_00, costsByCategoryMinor: null });
    expect(result.milestones).toEqual([]);
    expect(result.reachedMilestone).toBeNull();
    expect(result.secondSalaryMinor).toBe(50_000);
  });

  it('caps progress at one once a milestone is passed', () => {
    const { milestones } = wealthMilestones({ targetMonthlyMinor: null, capitalMinor: 5_000_000_00, costsByCategoryMinor: MADRID });
    expect(milestones.map(({ progress }) => progress)).toEqual([1, 1, 1]);
  });

  it('counts a negative portfolio as no progress, never negative progress', () => {
    const result = wealthMilestones({ targetMonthlyMinor: 250_000, capitalMinor: -10_000_00, costsByCategoryMinor: MADRID });
    expect(result.secondSalaryMinor).toBe(0);
    expect(result.target?.progress).toBe(0);
  });
});

describe('the second salary the person aims at', () => {
  it('has no target until one is set', () => {
    expect(wealthMilestones({ targetMonthlyMinor: null, capitalMinor: 100_000_00, costsByCategoryMinor: MADRID }).target).toBeNull();
  });

  it('treats a target of nothing as no target', () => {
    expect(wealthMilestones({ targetMonthlyMinor: 0, capitalMinor: 100_000_00, costsByCategoryMinor: MADRID }).target).toBeNull();
  });

  it('measures how far the second salary is toward the target, and the capital it needs', () => {
    const { target } = wealthMilestones({ targetMonthlyMinor: 250_000, capitalMinor: capitalNeededMinor(125_000), costsByCategoryMinor: MADRID });
    expect(target).toEqual({ monthlyMinor: 250_000, progress: 0.5, reached: false, capitalNeededMinor: capitalNeededMinor(250_000) });
  });

  it('is reached exactly when the second salary equals the target, and stops at full', () => {
    expect(wealthMilestones({ targetMonthlyMinor: 250_000, capitalMinor: capitalNeededMinor(250_000), costsByCategoryMinor: null }).target).toMatchObject({ reached: true, progress: 1 });
    expect(wealthMilestones({ targetMonthlyMinor: 250_000, capitalMinor: capitalNeededMinor(250_000) - 1_000, costsByCategoryMinor: null }).target?.reached).toBe(false);
    expect(wealthMilestones({ targetMonthlyMinor: 250_000, capitalMinor: 9_000_000_00, costsByCategoryMinor: null }).target?.progress).toBe(1);
  });

  it('does not depend on the costs being known', () => {
    expect(wealthMilestones({ targetMonthlyMinor: 250_000, capitalMinor: 0, costsByCategoryMinor: null }).target?.progress).toBe(0);
  });
});

const milestone = (overrides: Partial<CapitalMilestone> = {}): CapitalMilestone => ({
  id: 'm1',
  title: 'Property Down Payment',
  targetAmountMinor: 350_000_00,
  capitalRequiredPercentage: 30,
  category: 'PROPERTY',
  enabled: true,
  ...overrides,
});

describe('capitalMilestonePacing', () => {
  it('needs the share of the target the milestone asks for', () => {
    expect(capitalMilestonePacing({ milestone: milestone(), liquidPortfolioMinor: 0, monthlySurplusMinor: 1_000_00 }).capitalNeededMinor).toBe(105_000_00);
    expect(capitalMilestonePacing({ milestone: milestone({ capitalRequiredPercentage: 100 }), liquidPortfolioMinor: 0, monthlySurplusMinor: 1 }).capitalNeededMinor).toBe(350_000_00);
  });

  it('counts the months the surplus needs to close the gap, rounded up', () => {
    const pacing = capitalMilestonePacing({ milestone: milestone(), liquidPortfolioMinor: 80_000_00, monthlySurplusMinor: 1_200_00 });
    expect(pacing).toMatchObject({ capitalGapMinor: 25_000_00, monthsRemaining: 21, achieved: false }); // 20.83 months
  });

  it('is exact when the surplus divides the gap', () => {
    expect(capitalMilestonePacing({ milestone: milestone(), liquidPortfolioMinor: 95_000_00, monthlySurplusMinor: 1_000_00 }).monthsRemaining).toBe(10);
  });

  it('is achieved with no months to wait when the capital is already enough, even without a surplus', () => {
    for (const surplus of [1_000_00, 0, -500_00, null]) {
      const pacing = capitalMilestonePacing({ milestone: milestone(), liquidPortfolioMinor: 105_000_00, monthlySurplusMinor: surplus });
      expect(pacing).toMatchObject({ capitalGapMinor: 0, monthsRemaining: 0, achieved: true, progress: 1 });
    }
  });

  it.each([
    ['no surplus', 0],
    ['a deficit', -200_00],
    ['an unknown surplus', null],
  ])('cannot say when there is %s and a gap', (_label, surplus) => {
    expect(capitalMilestonePacing({ milestone: milestone(), liquidPortfolioMinor: 0, monthlySurplusMinor: surplus }).monthsRemaining).toBeNull();
  });

  it('measures progress toward the capital needed, never below zero or above one', () => {
    const progress = (liquidPortfolioMinor: number) => capitalMilestonePacing({ milestone: milestone(), liquidPortfolioMinor, monthlySurplusMinor: 1 }).progress;
    expect(progress(52_500_00)).toBe(0.5);
    expect(progress(0)).toBe(0);
    expect(progress(-10_000_00)).toBe(0);
    expect(progress(900_000_00)).toBe(1);
  });

  it('counts a negative portfolio as a bigger gap', () => {
    expect(capitalMilestonePacing({ milestone: milestone(), liquidPortfolioMinor: -5_000_00, monthlySurplusMinor: 1_000_00 }).capitalGapMinor).toBe(110_000_00);
  });

  it('rounds the capital needed to a whole cent', () => {
    expect(capitalMilestonePacing({ milestone: milestone({ targetAmountMinor: 1_001, capitalRequiredPercentage: 33 }), liquidPortfolioMinor: 0, monthlySurplusMinor: 1 }).capitalNeededMinor).toBe(330);
  });
});

describe('defaultCapitalRequiredPercentage', () => {
  it('asks for 30% of a property and all of a cash reserve', () => {
    expect(DEFAULT_CAPITAL_REQUIRED_PERCENTAGE).toEqual({ PROPERTY: 30, SABBATICAL: 100, VENTURE: 100, CUSTOM: 100 });
  });
});

describe('wealthMilestones with another yield', () => {
  it('uses the yield for the salary, the capital each milestone needs and the target', () => {
    const result = wealthMilestones({ targetMonthlyMinor: 300_000, capitalMinor: 24_000_000, costsByCategoryMinor: MADRID, annualYield: 0.03 });

    expect(result.secondSalaryMinor).toBe(secondSalaryMinor(24_000_000, 0.03));
    expect(result.milestones[1].capitalNeededMinor).toBe(capitalNeededMinor(90_000, 0.03));
    expect(result.target?.capitalNeededMinor).toBe(capitalNeededMinor(300_000, 0.03));
  });

  it('does not change the costs it was given', () => {
    const before = { ...MADRID };
    wealthMilestones({ targetMonthlyMinor: null, capitalMinor: 1, costsByCategoryMinor: MADRID });

    expect(MADRID).toEqual(before);
  });

  it('gives the same answer for the same input', () => {
    const input = { targetMonthlyMinor: 250_000, capitalMinor: 12_345_678, costsByCategoryMinor: MADRID };

    expect(wealthMilestones(input)).toEqual(wealthMilestones(input));
  });
});
