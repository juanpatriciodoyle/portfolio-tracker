import { describe, expect, it } from 'vitest';
import { makeCapitalHorizon, makePacedMilestone } from '../../test/fixtures';
import { describeCapitalMilestone } from '../describeCapitalHorizon';

const describeIt = (milestone = {}, horizon = {}) => {
  const response = makeCapitalHorizon(horizon);
  return describeCapitalMilestone(makePacedMilestone(milestone), response, 'en-US');
};

describe('describeCapitalMilestone', () => {
  it('says how many months away the goal is', () => {
    expect(describeIt().badge).toBe('Property Down Payment: 13 months away');
  });

  it('uses the singular for one month', () => {
    expect(describeIt({ monthsRemaining: 1 }).badge).toBe('Property Down Payment: 1 month away');
  });

  it('celebrates a goal that is achieved', () => {
    expect(describeIt({ achieved: true, monthsRemaining: 0, capitalGapMinor: 0, progress: 1 }).badge).toBe('Property Down Payment: Goal achieved!');
  });

  it('names the capital target and its requirement, and that spending stays protected', () => {
    expect(describeIt().subtext).toBe('€105,000 capital target (30% requirement) · Paced with your current lifestyle & spending protected.');
    expect(describeIt({ capitalRequiredPercentage: 100, capitalNeededMinor: 35_000_000 }).subtext).toMatch(/^€350,000 capital target \(100% requirement\)/);
  });

  it('does not promise a date when the surplus cannot close the gap', () => {
    const view = describeIt({ monthsRemaining: null }, { monthlySurplusMinor: 0 });
    expect(view.badge).toBe('Property Down Payment: no date yet');
    expect(view.subtext).toBe('€105,000 capital target (30% requirement) · Nothing is left over each month, so there is no date yet.');
    expect(describeIt({ monthsRemaining: null }, { monthlySurplusMinor: -5_000 }).subtext).toMatch(/Spending is above income/);
  });

  it.each([
    ['NO_CURRENT_PHASE', 'Add the place you live now to estimate the date.'],
    ['CURRENCY_MISMATCH', 'Your costs are in another currency than your portfolio, so the date cannot be estimated yet.'],
  ] as const)('explains the gap %s', (gap, reason) => {
    const view = describeIt({ monthsRemaining: null }, { gap, monthlySurplusMinor: null });
    expect(view.badge).toBe('Property Down Payment: no date yet');
    expect(view.subtext).toBe(`€105,000 capital target (30% requirement) · ${reason}`);
  });

  it('reports progress as a fraction and in words for screen readers', () => {
    const view = describeIt();
    expect(view.progress).toBeCloseTo(0.762, 3);
    expect(view.progressLabel).toBe('€80,000 of €105,000 capital target');
  });

  it('shows held capital as at most the capital needed', () => {
    expect(describeIt({ achieved: true, monthsRemaining: 0, capitalGapMinor: 0, progress: 1 }, { liquidPortfolioMinor: 200_000_00 }).progressLabel).toBe('€105,000 of €105,000 capital target');
  });
});
