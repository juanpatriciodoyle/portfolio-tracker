import { describe, expect, it } from 'vitest';
import { makeSecondSalary } from '../../test/fixtures';
import { describeSecondSalary } from '../describeSecondSalary';

const describeIt = (overrides = {}) => describeSecondSalary(makeSecondSalary(overrides), 'en-US');

describe('describeSecondSalary', () => {
  it('shows the second salary as a badge', () => {
    expect(describeIt().badge).toBe('Second Salary: €1,000 / month');
    expect(describeIt({ secondSalaryMinor: 123_456 }).badge).toBe('Second Salary: €1,234.56 / month');
    expect(describeIt({ secondSalaryMinor: 0 }).badge).toBe('Second Salary: €0 / month');
  });

  it.each([
    [1, 'Covers 100% of your utilities & subscriptions.'],
    [2, 'Covers 100% of your rent.'],
    [3, '100% Living Cost Autonomy (Your capital matches your burn).'],
  ] as const)('says what milestone %i means', (reachedMilestone, subtext) => {
    expect(describeIt({ reachedMilestone }).subtext).toBe(subtext);
  });

  it('says how far the nearest milestone is when none is reached', () => {
    const milestones = makeSecondSalary().milestones.map((milestone) => ({ ...milestone, reached: false, progress: milestone.id === 1 ? 0.456 : 0.1 }));
    expect(describeIt({ reachedMilestone: null, milestones }).subtext).toBe('45% of the way to covering your utilities & subscriptions.');
  });

  it('never rounds an unreached milestone up to 100%', () => {
    const milestones = makeSecondSalary().milestones.map((milestone) => ({ ...milestone, reached: false, progress: 0.9996 }));
    expect(describeIt({ reachedMilestone: null, milestones }).subtext).toMatch(/^99% /);
  });

  it.each([
    ['NO_CURRENT_PHASE', 'Add the place you live now to see what your second salary covers.'],
    ['NO_COSTS', 'Add your monthly costs to see what your second salary covers.'],
    ['CURRENCY_MISMATCH', 'Your costs are in another currency than your portfolio, so they cannot be compared yet.'],
  ] as const)('explains the gap %s instead of guessing', (gap, subtext) => {
    expect(describeIt({ gap, milestones: [], reachedMilestone: null }).subtext).toBe(subtext);
  });

  it('lays the milestones on the bar, with the target range after them', () => {
    const { bar } = describeIt();
    expect(bar.fill).toBeCloseTo(0.2);
    expect(bar.ticks.map(({ id, label, position, reached }) => ({ id, label, position, reached }))).toEqual([
      { id: 1, label: 'Utilities & subscriptions', position: 0.06, reached: true },
      { id: 2, label: 'Rent', position: 0.18, reached: true },
      { id: 3, label: 'Living costs', position: 0.3, reached: false },
    ]);
    expect(bar.targetStart).toBe(0.6);
    expect(bar.targetLabel).toBe('€3,000–€5,000 / month');
    expect(bar.targetNote).toBe('Needs €600,000–€1,000,000 invested');
  });

  it('describes the bar as one sentence for screen readers', () => {
    expect(describeIt().bar.summary).toBe('€1,000 of the €3,000–€5,000 a month target');
  });

  it('keeps the bar without ticks when no milestone can be shown', () => {
    expect(describeIt({ gap: 'NO_COSTS', milestones: [], reachedMilestone: null }).bar.ticks).toEqual([]);
  });
});
