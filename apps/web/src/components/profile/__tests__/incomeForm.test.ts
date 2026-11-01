import { describe, expect, it } from 'vitest';
import { describeIncomeChange, emptyIncomeForm, validateIncomeChange, withIncomeReason } from '../incomeForm';

const phase = { startDate: '2026-01-01', endDate: null as string | null };
const filled = { startDate: '2026-04-01', endDate: '', amount: '3,500', reason: 'PROMOTION' as const };

describe('validateIncomeChange', () => {
  it('builds the change the API expects: whole minor units, an open end as null', () => {
    expect(validateIncomeChange(filled, 'EUR', phase)).toEqual({
      ok: true,
      change: { startDate: '2026-04-01', endDate: null, amountMinor: 350000, reason: 'PROMOTION' },
    });
  });

  it('accepts an end date, no reason, and an income of zero', () => {
    expect(validateIncomeChange({ ...filled, endDate: '2026-06-30', reason: null, amount: '0' }, 'EUR', phase)).toEqual({
      ok: true,
      change: { startDate: '2026-04-01', endDate: '2026-06-30', amountMinor: 0, reason: null },
    });
  });

  it('asks for the day it starts and the amount', () => {
    expect(validateIncomeChange(emptyIncomeForm(), 'EUR', phase)).toEqual({
      ok: false,
      errors: { startDate: 'Pick the day it starts.', amount: 'Enter an amount such as 3200 or 0.' },
    });
  });

  it('rejects an end before the start, and days outside the home', () => {
    expect(validateIncomeChange({ ...filled, endDate: '2026-03-31' }, 'EUR', phase)).toMatchObject({ ok: false, errors: { endDate: 'It cannot end before it starts.' } });
    expect(validateIncomeChange({ ...filled, startDate: '2025-12-31' }, 'EUR', phase)).toMatchObject({ ok: false, errors: { startDate: 'Pick a day while you lived here.' } });
    expect(validateIncomeChange({ ...filled, startDate: '2026-07-01' }, 'EUR', { startDate: '2026-01-01', endDate: '2026-06-30' })).toMatchObject({
      ok: false,
      errors: { startDate: 'Pick a day while you lived here.' },
    });
  });

  it('reads the amount in the currency of the home', () => {
    expect(validateIncomeChange({ ...filled, amount: '350000' }, 'JPY', phase)).toMatchObject({ ok: true, change: { amountMinor: 350000 } });
  });
});

describe('withIncomeReason', () => {
  it('suggests no income for a stretch of unemployment, without overwriting an amount already typed', () => {
    expect(withIncomeReason(emptyIncomeForm(), 'UNEMPLOYMENT').amount).toBe('0');
    expect(withIncomeReason({ ...emptyIncomeForm(), amount: '800' }, 'UNEMPLOYMENT').amount).toBe('800');
    expect(withIncomeReason(emptyIncomeForm(), 'PROMOTION').amount).toBe('');
  });

  it('lets the person pick the same reason again to clear it', () => {
    expect(withIncomeReason({ ...emptyIncomeForm(), reason: 'NEW_JOB' }, 'NEW_JOB').reason).toBeNull();
  });
});

describe('describeIncomeChange', () => {
  it('says from when, until when and the reason', () => {
    expect(describeIncomeChange({ startDate: '2026-04-01', endDate: null, amountMinor: 350000, reason: 'PROMOTION' }, 'en-US')).toEqual({
      when: 'From Apr 1, 2026',
      reason: 'Promotion',
    });
    expect(describeIncomeChange({ startDate: '2026-02-01', endDate: '2026-02-28', amountMinor: 0, reason: 'UNEMPLOYMENT' }, 'en-US')).toEqual({
      when: 'Feb 1, 2026 – Feb 28, 2026',
      reason: 'Unemployment',
    });
    expect(describeIncomeChange({ startDate: '2026-02-01', endDate: null, amountMinor: 10, reason: null }, 'en-US').reason).toBeNull();
  });
});
