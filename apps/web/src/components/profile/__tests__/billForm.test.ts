import { describe, expect, it } from 'vitest';
import { makeBill } from '../../../test/fixtures';
import { billFormFrom, emptyBillForm, lastMonthPeriod, toUpdate, validateBill, type BillForm } from '../billForm';

const filled: BillForm = {
  category: 'ELECTRICITY',
  cadence: 'BIMONTHLY',
  vendor: ' Iberdrola ',
  amount: '96,50',
  periodStart: '2026-07-15',
  periodEnd: '2026-09-14',
};

describe('lastMonthPeriod', () => {
  it.each([
    ['2026-10-31', '2026-09-01', '2026-09-30'],
    ['2026-01-05', '2025-12-01', '2025-12-31'],
    ['2024-03-10', '2024-02-01', '2024-02-29'],
    ['2026-03-01', '2026-02-01', '2026-02-28'],
  ])('on %s the form starts with %s to %s', (asOf, start, end) => {
    expect(lastMonthPeriod(asOf)).toEqual({ start, end });
  });

  it('leaves the dates empty when the day is not known yet', () => {
    expect(lastMonthPeriod(null)).toEqual({ start: '', end: '' });
    expect(emptyBillForm(null)).toMatchObject({ periodStart: '', periodEnd: '' });
  });
});

describe('emptyBillForm', () => {
  it('starts with nothing chosen, monthly, and last month', () => {
    expect(emptyBillForm('2026-10-31')).toEqual({
      category: null,
      cadence: 'MONTHLY',
      vendor: '',
      amount: '',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
  });
});

describe('billFormFrom', () => {
  it('fills the form from a logged bill, with the amount in major units', () => {
    expect(billFormFrom(makeBill({ amountMinor: 9650 }))).toEqual({
      category: 'ELECTRICITY',
      cadence: 'BIMONTHLY',
      vendor: 'Iberdrola',
      amount: '96.50',
      periodStart: '2026-07-15',
      periodEnd: '2026-09-14',
    });
  });

  it('writes yen without decimals', () => {
    expect(billFormFrom(makeBill({ currency: 'JPY', amountMinor: 8000 })).amount).toBe('8000');
  });
});

describe('validateBill', () => {
  it('builds the request the API expects, with the amount in minor units and a trimmed vendor', () => {
    expect(validateBill(filled, 'p1', 'EUR')).toEqual({
      ok: true,
      create: {
        phaseId: 'p1',
        category: 'ELECTRICITY',
        cadence: 'BIMONTHLY',
        periodStart: '2026-07-15',
        periodEnd: '2026-09-14',
        amountMinor: 9650,
        vendor: 'Iberdrola',
      },
    });
  });

  it('accepts a one-off bill covering a single day', () => {
    const result = validateBill({ ...filled, cadence: 'ONE_OFF', periodEnd: filled.periodStart }, 'p1', 'EUR');

    expect(result).toMatchObject({ ok: true, create: { cadence: 'ONE_OFF' } });
  });

  it('asks for everything that is missing, in words', () => {
    const result = validateBill({ ...emptyBillForm(null), vendor: '  ' }, 'p1', 'EUR');

    expect(result).toEqual({
      ok: false,
      errors: {
        category: 'Pick what this bill is for.',
        vendor: 'Who sent this bill?',
        amount: 'Enter an amount such as 96 or 96.50.',
        periodStart: 'Pick the first day the bill covers.',
        periodEnd: 'Pick the last day the bill covers.',
      },
    });
  });

  it.each(['abc', '12x', '1.2.3', '-5'])('rejects the amount %p', (amount) => {
    expect(validateBill({ ...filled, amount }, 'p1', 'EUR')).toMatchObject({ ok: false, errors: { amount: expect.any(String) } });
  });

  it('rejects a bill that ends before it starts', () => {
    expect(validateBill({ ...filled, periodEnd: '2026-07-14' }, 'p1', 'EUR')).toEqual({
      ok: false,
      errors: { periodEnd: 'The bill cannot end before it starts.' },
    });
  });

  it('rejects an impossible date and an over-long vendor', () => {
    expect(validateBill({ ...filled, periodStart: '2026-02-30' }, 'p1', 'EUR')).toMatchObject({
      ok: false,
      errors: { periodStart: 'Enter a real date.' },
    });
    expect(validateBill({ ...filled, vendor: 'x'.repeat(81) }, 'p1', 'EUR')).toMatchObject({
      ok: false,
      errors: { vendor: 'Keep the name under 80 characters.' },
    });
  });

  it('reads the amount in the currency of the phase (yen has no cents)', () => {
    expect(validateBill({ ...filled, amount: '8000' }, 'p1', 'JPY')).toMatchObject({ ok: true, create: { amountMinor: 8000 } });
    expect(validateBill({ ...filled, amount: '80.50' }, 'p1', 'JPY')).toMatchObject({ ok: false });
  });
});

describe('toUpdate', () => {
  it('keeps every editable field and never the phase, which a bill cannot change', () => {
    const result = validateBill(filled, 'p1', 'EUR');
    if (!result.ok) throw new Error('expected a valid bill');

    const update = toUpdate(result.create);

    expect(update).toEqual({
      category: 'ELECTRICITY',
      cadence: 'BIMONTHLY',
      periodStart: '2026-07-15',
      periodEnd: '2026-09-14',
      amountMinor: 9650,
      vendor: 'Iberdrola',
    });
    expect(update).not.toHaveProperty('phaseId');
  });
});
