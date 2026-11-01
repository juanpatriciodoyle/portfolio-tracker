import { capitalMilestoneSchema, saveCapitalMilestonesRequest } from '../contracts';

const valid = { id: 'm1', title: 'Sabbatical Fund', targetAmountMinor: 40_000_00, capitalRequiredPercentage: 100, category: 'SABBATICAL', enabled: true };

describe('capitalMilestoneSchema', () => {
  it('accepts a configured milestone and trims the title', () => {
    expect(capitalMilestoneSchema.parse({ ...valid, title: '  Sabbatical Fund ' }).title).toBe('Sabbatical Fund');
  });

  it('is off until it is configured', () => {
    const { enabled: _enabled, ...withoutEnabled } = valid;
    expect(capitalMilestoneSchema.parse(withoutEnabled).enabled).toBe(false);
  });

  it.each([
    ['an empty title', { title: '   ' }],
    ['a title that is too long', { title: 'x'.repeat(61) }],
    ['a zero target', { targetAmountMinor: 0 }],
    ['a negative target', { targetAmountMinor: -1 }],
    ['a fractional target', { targetAmountMinor: 10.5 }],
    ['a target beyond the accepted amounts', { targetAmountMinor: 1_000_000_000_001 }],
    ['0%', { capitalRequiredPercentage: 0 }],
    ['more than 100%', { capitalRequiredPercentage: 101 }],
    ['a fractional percentage', { capitalRequiredPercentage: 12.5 }],
    ['an unknown category', { category: 'YACHT' }],
    ['an empty id', { id: '' }],
    ['a field it does not know', { colour: 'red' }],
  ])('rejects %s', (_label, change) => {
    expect(capitalMilestoneSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe('saveCapitalMilestonesRequest', () => {
  it('takes a list, which may be empty', () => {
    expect(saveCapitalMilestonesRequest.parse({ milestones: [] }).milestones).toEqual([]);
    expect(saveCapitalMilestonesRequest.parse({ milestones: [valid] }).milestones).toHaveLength(1);
  });

  it('rejects repeated ids and more than three milestones', () => {
    expect(saveCapitalMilestonesRequest.safeParse({ milestones: [valid, valid] }).success).toBe(false);
    const four = ['a', 'b', 'c', 'd'].map((id) => ({ ...valid, id }));
    expect(saveCapitalMilestonesRequest.safeParse({ milestones: four }).success).toBe(false);
  });
});
