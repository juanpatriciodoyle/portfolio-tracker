import { describe, expect, it } from 'vitest';
import { makeBill } from '../../../test/fixtures';
import {
  billFormFrom,
  emptyBillForm,
  NO_CONTEXT,
  toUpdate,
  validateBill,
  withCadence,
  withCategory,
  withPeriod,
  withVendor,
  type BillForm,
  type BillFormContext,
} from '../billForm';

const filled: BillForm = {
  category: 'ELECTRICITY',
  cadence: 'BIMONTHLY',
  vendor: ' Iberdrola ',
  amount: '96,50',
  periodStart: '2026-07-15',
  periodEnd: '2026-09-14',
  suggested: { category: false, cadence: false },
};

const context: BillFormContext = {
  today: '2026-11-01',
  countryCode: 'ES',
  history: [
    { vendor: 'Octopus', category: 'ELECTRICITY', cadence: 'BIMONTHLY' },
    { vendor: 'Digi', category: 'INTERNET', cadence: 'MONTHLY' },
  ],
};

describe('emptyBillForm', () => {
  it('starts with nothing chosen: no category, no cadence, no dates', () => {
    expect(emptyBillForm()).toEqual({
      category: null,
      cadence: null,
      vendor: '',
      amount: '',
      periodStart: '',
      periodEnd: '',
      suggested: { category: false, cadence: false },
    });
  });
});

describe('billFormFrom', () => {
  it('fills the form from a logged bill, with the amount in major units, nothing marked as a suggestion', () => {
    expect(billFormFrom(makeBill({ amountMinor: 9650 }))).toEqual({
      category: 'ELECTRICITY',
      cadence: 'BIMONTHLY',
      vendor: 'Iberdrola',
      amount: '96.50',
      periodStart: '2026-07-15',
      periodEnd: '2026-09-14',
      suggested: { category: false, cadence: false },
    });
  });

  it('writes yen without decimals', () => {
    expect(billFormFrom(makeBill({ currency: 'JPY', amountMinor: 8000 })).amount).toBe('8000');
  });
});

describe('picking a cadence', () => {
  it('fills the dates, ending today, when both are empty', () => {
    expect(withCadence(emptyBillForm(), 'MONTHLY', context)).toMatchObject({ cadence: 'MONTHLY', periodStart: '2026-10-02', periodEnd: '2026-11-01' });
    expect(withCadence(emptyBillForm(), 'BIMONTHLY', context)).toMatchObject({ periodStart: '2026-09-02', periodEnd: '2026-11-01' });
    expect(withCadence(emptyBillForm(), 'QUARTERLY', context)).toMatchObject({ periodStart: '2026-08-02', periodEnd: '2026-11-01' });
    expect(withCadence(emptyBillForm(), 'ANNUAL', context)).toMatchObject({ periodStart: '2025-11-02', periodEnd: '2026-11-01' });
    expect(withCadence(emptyBillForm(), 'ONE_OFF', context)).toMatchObject({ periodStart: '2026-11-01', periodEnd: '2026-11-01' });
  });

  it('works out the missing end of the dates from the one that is filled', () => {
    expect(withCadence({ ...emptyBillForm(), periodEnd: '2026-08-31' }, 'BIMONTHLY', context)).toMatchObject({ periodStart: '2026-07-01', periodEnd: '2026-08-31' });
    expect(withCadence({ ...emptyBillForm(), periodStart: '2026-08-01' }, 'MONTHLY', context)).toMatchObject({ periodStart: '2026-08-01', periodEnd: '2026-08-31' });
  });

  it('leaves dates that are already filled alone, and does not invent dates without knowing today', () => {
    expect(withCadence(filled, 'MONTHLY', context)).toMatchObject({ cadence: 'MONTHLY', periodStart: '2026-07-15', periodEnd: '2026-09-14' });
    expect(withCadence(emptyBillForm(), 'MONTHLY', { ...context, today: null })).toMatchObject({ cadence: 'MONTHLY', periodStart: '', periodEnd: '' });
  });

  it('is a choice of the person, not a suggestion', () => {
    expect(withCadence(emptyBillForm(), 'MONTHLY', context).suggested.cadence).toBe(false);
  });
});

describe('entering dates', () => {
  it('picks the cadence the dates match once both are in, whichever is entered first', () => {
    const start = withPeriod(emptyBillForm(), 'periodStart', '2026-09-01');
    expect(start.cadence).toBeNull();
    expect(withPeriod(start, 'periodEnd', '2026-09-30')).toMatchObject({ cadence: 'MONTHLY' });
    expect(withPeriod(withPeriod(emptyBillForm(), 'periodEnd', '2026-10-31'), 'periodStart', '2026-09-01')).toMatchObject({ cadence: 'BIMONTHLY' });
    expect(withPeriod(withPeriod(emptyBillForm(), 'periodStart', '2026-01-01'), 'periodEnd', '2026-12-31')).toMatchObject({ cadence: 'ANNUAL' });
  });

  it('allows a little more than the nominal month before it asks for the next cadence', () => {
    expect(withPeriod(withPeriod(emptyBillForm(), 'periodStart', '2026-09-01'), 'periodEnd', '2026-10-05').cadence).toBe('MONTHLY');
    expect(withPeriod(withPeriod(emptyBillForm(), 'periodStart', '2026-09-01'), 'periodEnd', '2026-10-06').cadence).toBe('BIMONTHLY');
  });

  it('keeps a cadence the person chose while the dates still fit it', () => {
    const quarterly: BillForm = { ...filled, cadence: 'QUARTERLY', periodStart: '2026-07-01', periodEnd: '2026-08-31' };
    expect(withPeriod(quarterly, 'periodEnd', '2026-08-15').cadence).toBe('QUARTERLY');
  });

  it('moves to the cadence that fits when the dates grow past the one that was picked', () => {
    const monthly: BillForm = { ...filled, cadence: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-09-30' };
    expect(withPeriod(monthly, 'periodEnd', '2026-11-30').cadence).toBe('QUARTERLY');
  });

  it('lets the dates keep correcting a cadence that was only inferred from them', () => {
    const inferred = withPeriod(withPeriod(emptyBillForm(), 'periodStart', '2026-09-01'), 'periodEnd', '2026-11-30');
    expect(inferred.cadence).toBe('QUARTERLY');
    expect(withPeriod(inferred, 'periodEnd', '2026-09-20').cadence).toBe('MONTHLY');
  });

  it('does nothing about a cadence when a date is cleared, backwards or impossible', () => {
    const monthly: BillForm = { ...filled, cadence: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-09-30' };
    expect(withPeriod(monthly, 'periodEnd', '').cadence).toBe('MONTHLY');
    expect(withPeriod(monthly, 'periodEnd', '2026-08-01').cadence).toBe('MONTHLY');
    expect(withPeriod(emptyBillForm(), 'periodStart', '2026-02-30').cadence).toBeNull();
  });

  it('gives up on a period longer than a year, leaving the cadence for the person', () => {
    const result = withPeriod(withPeriod(emptyBillForm(), 'periodStart', '2025-01-01'), 'periodEnd', '2026-12-31');
    expect(result.cadence).toBeNull();
  });
});

describe('typing who sent the bill', () => {
  it('preselects the category and cadence of a sender the person already has', () => {
    expect(withVendor(emptyBillForm(), 'Octopus Energy', context)).toMatchObject({
      vendor: 'Octopus Energy',
      category: 'ELECTRICITY',
      cadence: 'BIMONTHLY',
      periodStart: '2026-09-02',
      periodEnd: '2026-11-01',
      suggested: { category: true, cadence: true },
    });
  });

  it('falls back to the words of the name, then to the dictionary, with the country as context', () => {
    expect(withVendor(emptyBillForm(), 'Aguas de Valencia', context).category).toBe('WATER');
    expect(withVendor(emptyBillForm(), 'NESS', context).category).toBe('HEATING_COOLING');
    expect(withVendor(emptyBillForm(), 'Endesa', context).category).toBe('ELECTRICITY');
  });

  it('knows how often a well-known sender bills', () => {
    expect(withVendor(emptyBillForm(), 'Netflix', context)).toMatchObject({ category: 'SUBSCRIPTIONS', cadence: 'MONTHLY' });
  });

  it('follows the name as it is retyped, because nothing was chosen by the person', () => {
    const first = withVendor(emptyBillForm(), 'Netflix', context);
    expect(withVendor(first, 'Aguas de Valencia', context)).toMatchObject({ category: 'WATER', suggested: { category: true } });
  });

  it('takes a suggestion back when the name no longer suggests anything', () => {
    const first = withVendor(emptyBillForm(), 'Netflix', context);
    expect(withVendor(first, 'Zorblax', context)).toMatchObject({ category: null, suggested: { category: false } });
  });

  it('never overrides a category or cadence the person picked', () => {
    const picked = withCadence(withCategory(emptyBillForm(), 'GAS'), 'QUARTERLY', context);
    expect(withVendor(picked, 'Octopus Energy', context)).toMatchObject({ category: 'GAS', cadence: 'QUARTERLY', suggested: { category: false, cadence: false } });
  });

  it('does not pull a cadence from a sender whose category the person contradicted', () => {
    const gas = withCategory(emptyBillForm(), 'GAS');
    expect(withVendor(gas, 'Octopus Energy', context).cadence).toBeNull();
  });

  it('leaves the dates and the cadence alone once the dates are filled, since the dates decide', () => {
    const dated = withPeriod(withPeriod(emptyBillForm(), 'periodStart', '2026-10-01'), 'periodEnd', '2026-10-31');
    expect(withVendor(dated, 'Octopus Energy', context)).toMatchObject({ category: 'ELECTRICITY', cadence: 'MONTHLY', periodStart: '2026-10-01', periodEnd: '2026-10-31' });
  });

  it('suggests nothing without a name, and nothing at all for a form without context', () => {
    expect(withVendor(emptyBillForm(), '  ', context)).toMatchObject({ category: null, cadence: null });
    expect(withVendor(emptyBillForm(), 'Octopus Energy', NO_CONTEXT)).toMatchObject({ category: 'ELECTRICITY', cadence: null });
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
    const result = validateBill({ ...emptyBillForm(), vendor: '  ' }, 'p1', 'EUR');

    expect(result).toEqual({
      ok: false,
      errors: {
        category: 'Pick what this bill is for.',
        vendor: 'Who sent this bill?',
        amount: 'Enter an amount such as 96 or 96.50.',
        periodStart: 'Pick the first day the bill covers.',
        periodEnd: 'Pick the last day the bill covers.',
        cadence: 'Pick how often this bill comes.',
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

  it('rejects dates longer than the cadence allows, naming the limit', () => {
    expect(validateBill({ ...filled, cadence: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-10-06' }, 'p1', 'EUR')).toEqual({
      ok: false,
      errors: { periodEnd: 'A bill that comes every month can cover at most 35 days. Pick a longer cadence or shorten the dates.' },
    });
    expect(validateBill({ ...filled, cadence: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-10-05' }, 'p1', 'EUR')).toMatchObject({ ok: true });
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
