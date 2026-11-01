import { describe, expect, it } from 'vitest';
import { makePacedMilestone } from '../../test/fixtures';
import { formFromMilestone, formForPreset, validateMilestoneForm, withCategory } from '../capitalMilestoneForm';

describe('formForPreset', () => {
  it.each([
    ['PROPERTY', 'Property Down Payment', '30'],
    ['SABBATICAL', 'Sabbatical Fund', '100'],
    ['VENTURE', 'Venture Launchpad', '100'],
    ['CUSTOM', '', '100'],
  ] as const)('starts a %s goal with its name and requirement', (category, title, percentage) => {
    expect(formForPreset(category)).toEqual({ title, amount: '', percentage, category });
  });
});

describe('withCategory', () => {
  it('moves the name and requirement along while they are still the preset ones', () => {
    expect(withCategory(formForPreset('PROPERTY'), 'SABBATICAL')).toEqual({ title: 'Sabbatical Fund', amount: '', percentage: '100', category: 'SABBATICAL' });
  });

  it('keeps what the person typed', () => {
    const typed = { ...formForPreset('PROPERTY'), title: 'Flat in Lisbon', percentage: '20' };
    expect(withCategory(typed, 'SABBATICAL')).toMatchObject({ title: 'Flat in Lisbon', percentage: '20', category: 'SABBATICAL' });
  });

  it('keeps the target amount', () => {
    expect(withCategory({ ...formForPreset('PROPERTY'), amount: '350000' }, 'VENTURE').amount).toBe('350000');
  });
});

describe('formFromMilestone', () => {
  it('shows an existing goal as it would be typed', () => {
    expect(formFromMilestone(makePacedMilestone(), 'EUR')).toEqual({ title: 'Property Down Payment', amount: '350000', percentage: '30', category: 'PROPERTY' });
  });
});

describe('validateMilestoneForm', () => {
  const filled = { title: ' Property Down Payment ', amount: '350,000', percentage: '30', category: 'PROPERTY' as const };

  it('makes an enabled milestone from a filled form, keeping the id it is given', () => {
    expect(validateMilestoneForm(filled, 'EUR', 'm9')).toEqual({
      ok: true,
      milestone: { id: 'm9', title: 'Property Down Payment', targetAmountMinor: 35_000_000, capitalRequiredPercentage: 30, category: 'PROPERTY', enabled: true },
    });
  });

  it.each([
    ['no name', { title: '  ' }, 'title', 'Give it a name.'],
    ['a name that is too long', { title: 'x'.repeat(61) }, 'title', 'Keep the name under 60 characters.'],
    ['no amount', { amount: '' }, 'amount', 'Enter an amount such as 350000.'],
    ['a zero amount', { amount: '0' }, 'amount', 'Enter an amount such as 350000.'],
    ['text for an amount', { amount: 'a lot' }, 'amount', 'Enter an amount such as 350000.'],
    ['an amount beyond what can be stored', { amount: '20000000000' }, 'amount', 'That amount is too large.'],
    ['0%', { percentage: '0' }, 'percentage', 'Use a whole number from 1 to 100.'],
    ['150%', { percentage: '150' }, 'percentage', 'Use a whole number from 1 to 100.'],
    ['12.5%', { percentage: '12.5' }, 'percentage', 'Use a whole number from 1 to 100.'],
    ['an empty percentage', { percentage: '' }, 'percentage', 'Use a whole number from 1 to 100.'],
  ])('rejects %s', (_label, change, field, message) => {
    expect(validateMilestoneForm({ ...filled, ...change }, 'EUR', 'm9')).toEqual({ ok: false, errors: { [field]: message } });
  });

  it('reports every problem at once', () => {
    const result = validateMilestoneForm({ ...filled, title: '', amount: '', percentage: '0' }, 'EUR', 'm9');
    expect(result.ok === false && Object.keys(result.errors).sort()).toEqual(['amount', 'percentage', 'title']);
  });
});
