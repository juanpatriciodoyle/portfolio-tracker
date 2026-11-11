import { describe, expect, it } from 'vitest';
import { describeIncomeEnd, describeIncomeStream, emptyIncomeStreamForm, endJob, groupIncome, incomeStreamFormFrom, reopenJob, validateIncomeStream, type IncomeStreamForm } from '../incomeForm';

const phase = { startDate: '2026-01-01', endDate: '2026-12-31' };
const form: IncomeStreamForm = { kind: 'MONTHLY', endReason: '', label: 'Salary', amount: '3200', startDate: '2026-02-01', endDate: '' };

describe('emptyIncomeStreamForm', () => {
  it('starts on the first day of the home', () => {
    expect(emptyIncomeStreamForm(phase)).toEqual({ kind: 'MONTHLY', endReason: '', label: '', amount: '', startDate: '2026-01-01', endDate: '' });
  });
});

describe('incomeStreamFormFrom', () => {
  it('writes the amount the way a person types it, in the currency exponent', () => {
    const stream = { label: 'Pension', amountMinor: 120050, startDate: '2026-02-01', endDate: '2026-03-01' };
    expect(incomeStreamFormFrom(stream, 'EUR')).toEqual({ kind: 'MONTHLY', endReason: '', label: 'Pension', amount: '1200.50', startDate: '2026-02-01', endDate: '2026-03-01' });
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
    const result = validateIncomeStream({ ...form, label: ' ', amount: '', startDate: '' }, 'EUR', phase);
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

describe('one-time deposits', () => {
  it('saves a single day with no end, and ignores an end date left in the form', () => {
    const result = validateIncomeStream({ ...form, kind: 'ONE_TIME', label: 'Unemployment benefit', amount: '1200', startDate: '2026-03-10', endDate: '2026-04-01' }, 'EUR', phase);
    expect(result).toEqual({ ok: true, stream: { label: 'Unemployment benefit', amountMinor: 120000, startDate: '2026-03-10', endDate: null, kind: 'ONE_TIME' } });
  });

  it('keeps the day inside the home', () => {
    expect(validateIncomeStream({ ...form, kind: 'ONE_TIME', startDate: '2027-03-10' }, 'EUR', phase).ok).toBe(false);
  });

  it('is described by the day it was paid', () => {
    expect(describeIncomeStream({ label: 'a', amountMinor: 1, startDate: '2026-03-10', endDate: null, kind: 'ONE_TIME' }, 'en-US')).toBe('Paid Mar 10, 2026');
  });
});

describe('the reason a job ended', () => {
  it('is saved with an end date and left out without one', () => {
    expect(validateIncomeStream({ ...form, endDate: '2026-05-31', endReason: 'LAID_OFF' }, 'EUR', phase)).toMatchObject({ ok: true, stream: { endDate: '2026-05-31', endReason: 'LAID_OFF' } });
    const open = validateIncomeStream({ ...form, endReason: 'LAID_OFF' }, 'EUR', phase);
    expect(open.ok && 'endReason' in open.stream).toBe(false);
  });

  it('reads as "Laid off · ended <day>", or "Ended <day>" when it was not said', () => {
    const base = { label: 'a', amountMinor: 1, startDate: '2026-01-01', endDate: '2026-03-12' };
    expect(describeIncomeEnd({ ...base, endReason: 'LAID_OFF' }, 'en-US')).toBe('Laid off · ended Mar 12, 2026');
    expect(describeIncomeEnd(base, 'en-US')).toBe('Ended Mar 12, 2026');
    expect(describeIncomeEnd({ ...base, endDate: null }, 'en-US')).toBeNull();
  });
});

describe('endJob and reopenJob', () => {
  const job = { label: 'Salary', amountMinor: 320000, startDate: '2026-01-01', endDate: null };

  it('ends a job on its last day with the reason', () => {
    expect(endJob(job, '2026-06-12', 'QUIT', { endDate: null })).toEqual({ ok: true, stream: { ...job, endDate: '2026-06-12', endReason: 'QUIT' } });
  });

  it('leaves the reason out when none is chosen', () => {
    const result = endJob(job, '2026-06-12', '', { endDate: null });
    expect(result.ok && 'endReason' in result.stream).toBe(false);
  });

  it('refuses a last day before the start or after the home ended', () => {
    expect(endJob(job, '2025-12-31', '', { endDate: null }).ok).toBe(false);
    expect(endJob(job, '2026-09-01', '', { endDate: '2026-08-31' }).ok).toBe(false);
    expect(endJob(job, '', '', { endDate: null }).ok).toBe(false);
  });

  it('brings a job back without an end or a reason', () => {
    const ended = { ...job, endDate: '2026-06-12', endReason: 'QUIT' as const };
    expect(reopenJob(ended)).toEqual(job);
  });
});

describe('groupIncome', () => {
  const streams = [
    { label: 'Open', amountMinor: 1, startDate: '2026-01-01', endDate: null },
    { label: 'Ended', amountMinor: 1, startDate: '2026-01-01', endDate: '2026-03-01' },
    { label: 'Ends soon', amountMinor: 1, startDate: '2026-01-01', endDate: '2026-12-01' },
    { label: 'Benefit', amountMinor: 1, startDate: '2026-03-02', endDate: null, kind: 'ONE_TIME' as const },
  ];

  it('separates what pays now, what ended before today, and one-time deposits, remembering each place in the list', () => {
    const groups = groupIncome(streams, '2026-06-01');
    expect(groups.paying.map((row) => row.stream.label)).toEqual(['Open', 'Ends soon']);
    expect(groups.ended.map((row) => [row.stream.label, row.index])).toEqual([['Ended', 1]]);
    expect(groups.oneTime.map((row) => row.stream.label)).toEqual(['Benefit']);
  });

  it('counts a job ending today as still paying today', () => {
    expect(groupIncome([{ ...streams[1], endDate: '2026-06-01' }], '2026-06-01').paying).toHaveLength(1);
  });

  it('without a today, only a job with an end date is ended', () => {
    const groups = groupIncome(streams, undefined);
    expect(groups.ended.map((row) => row.stream.label)).toEqual(['Ended', 'Ends soon']);
  });
});
