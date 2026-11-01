import { describe, expect, it } from 'vitest';
import { describeIncomeStream, emptyIncomeStreamForm, incomeStreamFormFrom, validateIncomeStream } from '../incomeForm';

const phase = { startDate: '2026-01-01', endDate: '2026-12-31' };
const form = { label: 'Salary', amount: '3200', startDate: '2026-02-01', endDate: '' };

describe('emptyIncomeStreamForm', () => {
  it('starts on the first day of the home', () => {
    expect(emptyIncomeStreamForm(phase)).toEqual({ label: '', amount: '', startDate: '2026-01-01', endDate: '' });
  });
});

describe('incomeStreamFormFrom', () => {
  it('writes the amount the way a person types it, in the currency exponent', () => {
    const stream = { label: 'Pension', amountMinor: 120050, startDate: '2026-02-01', endDate: '2026-03-01' };
    expect(incomeStreamFormFrom(stream, 'EUR')).toEqual({ label: 'Pension', amount: '1200.50', startDate: '2026-02-01', endDate: '2026-03-01' });
  });
});

describe('validateIncomeStream', () => {
  it('turns a valid form into a stream: trimmed label, minor units, no end meaning still paying', () => {
    expect(validateIncomeStream({ ...form, label: '  Salary ', amount: '3.200,50' }, 'EUR', phase)).toEqual({
      ok: true,
      stream: { label: 'Salary', amountMinor: 320050, startDate: '2026-02-01', endDate: null },
    });
  });

  it('accepts a stream that pays nothing', () => {
    const result = validateIncomeStream({ ...form, amount: '0' }, 'EUR', phase);
    expect(result.ok && result.stream.amountMinor).toBe(0);
  });

  it('asks for a name, an amount and a start', () => {
    const result = validateIncomeStream({ label: ' ', amount: '', startDate: '', endDate: '' }, 'EUR', phase);
    expect(result).toEqual({ ok: false, errors: { label: 'Name it, for example Salary.', amount: 'Enter an amount such as 3200.', startDate: 'Pick the day it starts.' } });
  });

  it('keeps the start inside the home, on both edges, and an open home open-ended', () => {
    expect(validateIncomeStream({ ...form, startDate: '2025-12-31' }, 'EUR', phase).ok).toBe(false);
    expect(validateIncomeStream({ ...form, startDate: '2026-01-01' }, 'EUR', phase).ok).toBe(true);
    expect(validateIncomeStream({ ...form, startDate: '2026-12-31' }, 'EUR', phase).ok).toBe(true);
    expect(validateIncomeStream({ ...form, startDate: '2027-01-01' }, 'EUR', phase).ok).toBe(false);
    expect(validateIncomeStream({ ...form, startDate: '2040-01-01' }, 'EUR', { startDate: '2026-01-01', endDate: null }).ok).toBe(true);
  });

  it('refuses an end before the start and a name that is too long', () => {
    expect(validateIncomeStream({ ...form, endDate: '2026-01-31' }, 'EUR', phase)).toMatchObject({ ok: false, errors: { endDate: 'It cannot end before it starts.' } });
    expect(validateIncomeStream({ ...form, label: 'x'.repeat(61) }, 'EUR', phase)).toMatchObject({ ok: false, errors: { label: expect.any(String) } });
  });
});

describe('describeIncomeStream', () => {
  it('says from when it pays, or the two days it paid between', () => {
    expect(describeIncomeStream({ label: 'a', amountMinor: 1, startDate: '2026-04-01', endDate: null }, 'en-US')).toBe('From Apr 1, 2026');
    expect(describeIncomeStream({ label: 'a', amountMinor: 1, startDate: '2026-02-01', endDate: '2026-02-28' }, 'en-US')).toBe('Feb 1, 2026 – Feb 28, 2026');
  });
});
