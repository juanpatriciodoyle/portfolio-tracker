import { FIXED_COST_CATEGORIES, type FixedCostCategory } from '../contracts';
import {
  CONSERVATIVE_REAL_YIELD,
  SECOND_SALARY_TARGET_MAX_MINOR,
  SECOND_SALARY_TARGET_MIN_MINOR,
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
    expect(wealthMilestones({ capitalMinor: 100_000_00, costsByCategoryMinor: MADRID }).secondSalaryMinor).toBe(50_000);
  });

  it('works out each milestone from the categories of the monthly costs', () => {
    const { milestones } = wealthMilestones({ capitalMinor: 0, costsByCategoryMinor: MADRID });
    expect(milestones.map(({ id, kind, monthlyCostMinor }) => ({ id, kind, monthlyCostMinor }))).toEqual([
      { id: 1, kind: 'UTILITIES_AND_SUBSCRIPTIONS', monthlyCostMinor: 30_000 },
      { id: 2, kind: 'RENT', monthlyCostMinor: 90_000 },
      { id: 3, kind: 'LIVING_COST', monthlyCostMinor: 150_000 },
    ]);
  });

  it('reaches no milestone with no capital, and says how far the first is', () => {
    const result = wealthMilestones({ capitalMinor: 0, costsByCategoryMinor: MADRID });
    expect(result.reachedMilestone).toBeNull();
    expect(result.milestones.every(({ reached }) => !reached)).toBe(true);
    expect(result.milestones[0].progress).toBe(0);
  });

  it('reaches the first milestone exactly when the second salary equals the cost', () => {
    const exact = capitalNeededMinor(30_000);
    expect(wealthMilestones({ capitalMinor: exact, costsByCategoryMinor: MADRID }).reachedMilestone).toBe(1);
    const justShort = wealthMilestones({ capitalMinor: exact - 1_000,costsByCategoryMinor: MADRID });
    expect(justShort.reachedMilestone).toBeNull();
    expect(justShort.milestones[0].progress).toBeLessThan(1);
  });

  it('names the highest milestone reached', () => {
    expect(wealthMilestones({ capitalMinor: capitalNeededMinor(90_000), costsByCategoryMinor: MADRID }).reachedMilestone).toBe(2);
    expect(wealthMilestones({ capitalMinor: capitalNeededMinor(150_000), costsByCategoryMinor: MADRID }).reachedMilestone).toBe(3);
  });

  it('records the capital each milestone needs', () => {
    const { milestones } = wealthMilestones({ capitalMinor: 0, costsByCategoryMinor: MADRID });
    expect(milestones.map(({ capitalNeededMinor: needed }) => needed)).toEqual([capitalNeededMinor(30_000), capitalNeededMinor(90_000), capitalNeededMinor(150_000)]);
  });

  it('leaves out a milestone whose cost is nothing: covering nothing is no achievement', () => {
    const { milestones, reachedMilestone } = wealthMilestones({ capitalMinor: 1_000_000_00, costsByCategoryMinor: costs({ RENT: 80_000 }) });
    expect(milestones.map(({ id }) => id)).toEqual([2, 3]);
    expect(reachedMilestone).toBe(3);
  });

  it('has no milestones when no cost is known, and still shows the second salary', () => {
    const result = wealthMilestones({ capitalMinor: 100_000_00, costsByCategoryMinor: null });
    expect(result.milestones).toEqual([]);
    expect(result.reachedMilestone).toBeNull();
    expect(result.secondSalaryMinor).toBe(50_000);
  });

  it('caps progress at one once a milestone is passed', () => {
    const { milestones } = wealthMilestones({ capitalMinor: 5_000_000_00, costsByCategoryMinor: MADRID });
    expect(milestones.map(({ progress }) => progress)).toEqual([1, 1, 1]);
  });

  it('counts a negative portfolio as no progress, never negative progress', () => {
    const result = wealthMilestones({ capitalMinor: -10_000_00, costsByCategoryMinor: MADRID });
    expect(result.secondSalaryMinor).toBe(0);
    expect(result.target.progress).toBe(0);
  });
});

describe('the 3,000 to 5,000 euro target', () => {
  it('is a full second salary of 3,000 to 5,000 euros a month', () => {
    expect(SECOND_SALARY_TARGET_MIN_MINOR).toBe(300_000);
    expect(SECOND_SALARY_TARGET_MAX_MINOR).toBe(500_000);
  });

  it('measures progress along the way to the top of the range, and marks where the range starts', () => {
    const { target } = wealthMilestones({ capitalMinor: capitalNeededMinor(250_000), costsByCategoryMinor: MADRID });
    expect(target.progress).toBeCloseTo(0.5, 2);
    expect(target.minMarker).toBeCloseTo(0.6, 5);
    expect(target.minCapitalNeededMinor).toBe(capitalNeededMinor(300_000));
    expect(target.maxCapitalNeededMinor).toBe(capitalNeededMinor(500_000));
    expect(target.reachedMin).toBe(false);
  });

  it('is reached at the bottom of the range, and full at the top', () => {
    expect(wealthMilestones({ capitalMinor: capitalNeededMinor(300_000), costsByCategoryMinor: null }).target.reachedMin).toBe(true);
    expect(wealthMilestones({ capitalMinor: capitalNeededMinor(600_000), costsByCategoryMinor: null }).target.progress).toBe(1);
  });

  it('places each milestone on the same scale as the target, so one bar can show them all', () => {
    const { milestones } = wealthMilestones({ capitalMinor: 0, costsByCategoryMinor: MADRID });
    expect(milestones.map(({ position }) => position)).toEqual([0.06, 0.18, 0.3]);
  });

  it('keeps a milestone above the range at the end of the bar', () => {
    const { milestones } = wealthMilestones({ capitalMinor: 0, costsByCategoryMinor: costs({ RENT: 900_000 }) });
    expect(milestones.find(({ id }) => id === 2)?.position).toBe(1);
  });
});
