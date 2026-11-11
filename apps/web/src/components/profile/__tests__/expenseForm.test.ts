import { describe, expect, it } from 'vitest';
import { makePhase } from '../../../test/fixtures';
import {
  asksIfItRepeats,
  datesRequired,
  emptyExpenseForm,
  expenseFormFromDraft,
  resolveExpense,
  stepsFor,
  validateStep,
  withFrequency,
  withOfferedDates,
  withSingleDay,
  withSpansDays,
  type ExpenseForm,
} from '../expenseForm';

const madrid = makePhase({ id: 'madrid', startDate: '2022-09-01', endDate: '2024-08-31', currency: 'EUR' });
const lisbon = makePhase({ id: 'lisbon', name: 'Lisbon', countryCode: 'PT', startDate: '2024-09-01', endDate: null, currency: 'EUR' });
const phases = [madrid, lisbon];
const TODAY = '2026-10-31';

const form = (overrides: Partial<ExpenseForm> = {}): ExpenseForm => ({
  ...emptyExpenseForm(),
  vendor: 'Landlord',
  category: 'RENT',
  cadence: 'MONTHLY',
  amount: '900',
  ...overrides,
});

describe('which days an expense asks for', () => {
  it('requires them for bills that change every time, one-time expenses and documents', () => {
    expect(datesRequired(form({ category: 'ELECTRICITY' }))).toBe(true);
    expect(datesRequired(form({ cadence: 'ONE_OFF' }))).toBe(true);
    expect(datesRequired(form({ fromDocument: true }))).toBe(true);
  });

  it('leaves them optional for rent, internet, phone and subscriptions that repeat', () => {
    for (const category of ['RENT', 'INTERNET', 'PHONE', 'SUBSCRIPTIONS'] as const) expect(datesRequired(form({ category }))).toBe(false);
  });

  it('offers the days of the bill ending today, for a bill that needs them', () => {
    const offered = withOfferedDates(form({ category: 'ELECTRICITY', cadence: 'BIMONTHLY' }), TODAY);
    expect(offered.periodEnd).toBe(TODAY);
    expect(offered.periodStart).toBe('2026-09-01');
  });

  it('offers today as the day a one-time expense was paid', () => {
    const offered = withOfferedDates(form({ cadence: 'ONE_OFF' }), TODAY);
    expect([offered.periodStart, offered.periodEnd]).toEqual([TODAY, TODAY]);
  });

  it('offers nothing for a repeating rent, and never fills in a document in silence', () => {
    expect(withOfferedDates(form(), TODAY)).toEqual(form());
    const document = form({ fromDocument: true, category: 'ELECTRICITY' });
    expect(withOfferedDates(document, TODAY)).toEqual(document);
  });

  it('does not ask for an end day for a one-time expense on a single day', () => {
    const single = withSingleDay(form({ cadence: 'ONE_OFF' }), '2026-03-04');
    expect(validateStep('dates', single, 'EUR')).toEqual({});
    expect(single.periodEnd).toBe('2026-03-04');
  });

  it('asks for both ends when a one-time expense covers several days', () => {
    const several = withSpansDays(form({ cadence: 'ONE_OFF', periodStart: '2026-03-04', periodEnd: '2026-03-04' }), true);
    expect(validateStep('dates', { ...several, periodEnd: '' }, 'EUR').periodEnd).toBe('Pick the last day it covers.');
    expect(validateStep('dates', { ...several, periodEnd: '2026-04-03' }, 'EUR')).toEqual({});
  });

  it('keeps a bill that is too long for how often it comes from moving on', () => {
    const errors = validateStep('dates', form({ category: 'GAS', cadence: 'MONTHLY', periodStart: '2026-01-01', periodEnd: '2026-03-31' }), 'EUR');
    expect(errors.periodEnd).toMatch(/at most 35 days/);
  });

  it('wants a bill that changes every time to have its days', () => {
    expect(validateStep('dates', form({ category: 'WATER' }), 'EUR').periodStart).toBeDefined();
  });

  it('wants both ends or neither for a repeating rent', () => {
    expect(validateStep('dates', form(), 'EUR')).toEqual({});
    expect(validateStep('dates', form({ periodStart: '2026-01-01' }), 'EUR').periodEnd).toBeDefined();
  });
});

describe('what is stored', () => {
  it('stores a repeating rent with no days as a rate in the home lived in today', () => {
    const result = resolveExpense(form(), phases, TODAY);
    expect(result).toMatchObject({ ok: true, kind: 'RATE', phase: { id: 'lisbon' } });
    expect(result.ok && result.kind === 'RATE' && result.create).toEqual({ category: 'RENT', cadence: 'MONTHLY', amountMinor: 90000, label: 'Landlord' });
  });

  it('stores an electricity bill as a receipt in the home its first day falls in', () => {
    const result = resolveExpense(form({ category: 'ELECTRICITY', vendor: 'Iberdrola', cadence: 'BIMONTHLY', amount: '96.50', periodStart: '2023-03-01', periodEnd: '2023-04-30' }), phases, TODAY);
    expect(result).toMatchObject({ ok: true, kind: 'RECEIPT' });
    expect(result.ok && result.kind === 'RECEIPT' && result.create).toMatchObject({ phaseId: 'madrid', cadence: 'BIMONTHLY', amountMinor: 9650 });
  });

  it('asks "Will this come again?" for a dated rent, and stores the answer', () => {
    const dated = form({ periodStart: '2026-01-01', periodEnd: '2026-01-31' });
    expect(asksIfItRepeats(dated)).toBe(true);
    expect(stepsFor(dated)).toEqual(['who', 'amount', 'dates', 'again']);
    expect(resolveExpense(dated, phases, TODAY)).toEqual({ ok: false, errors: { repeats: 'Pick one.' } });

    const repeats = resolveExpense({ ...dated, repeats: true }, phases, TODAY);
    expect(repeats.ok && repeats.kind === 'RECEIPT' && repeats.create.cadence).toBe('MONTHLY');
    const once = resolveExpense({ ...dated, repeats: false }, phases, TODAY);
    expect(once.ok && once.kind === 'RECEIPT' && once.create.cadence).toBe('ONE_OFF');
  });

  it('never asks for a rent without days, a bill that changes, or a document', () => {
    expect(stepsFor(form())).toEqual(['who', 'amount', 'dates']);
    expect(stepsFor(form({ category: 'GAS', periodStart: '2026-01-01', periodEnd: '2026-01-31' }))).toEqual(['who', 'amount', 'dates']);
    expect(stepsFor(form({ fromDocument: true, periodStart: '2026-01-01', periodEnd: '2026-01-31' }))).toEqual(['who', 'amount', 'dates']);
  });

  it('stores a one-time expense on one day as a one-off receipt of that day', () => {
    const result = resolveExpense(withSingleDay(form({ category: 'OTHER', vendor: 'Airalo eSIM', cadence: 'ONE_OFF', amount: '18' }), '2023-05-02'), phases, TODAY);
    expect(result.ok && result.kind === 'RECEIPT' && result.create).toMatchObject({ phaseId: 'madrid', cadence: 'ONE_OFF', periodStart: '2023-05-02', periodEnd: '2023-05-02' });
  });

  it('stores a month-long stay as a one-off with its days', () => {
    const stay = withSpansDays(form({ category: 'RENT', vendor: 'Airbnb', cadence: 'ONE_OFF', amount: '1400', periodStart: '2025-06-01', periodEnd: '2025-06-30' }), true);
    const result = resolveExpense(stay, phases, TODAY);
    expect(result.ok && result.kind === 'RECEIPT' && result.create).toMatchObject({ cadence: 'ONE_OFF', periodStart: '2025-06-01', periodEnd: '2025-06-30' });
  });

  it('says so, and guesses nothing, when no home covers the day', () => {
    const result = resolveExpense(form({ category: 'GAS', periodStart: '2019-01-01', periodEnd: '2019-01-31' }), phases, TODAY);
    expect(result).toEqual({ ok: false, errors: { periodStart: 'No living phase covers that day. Pick a day you lived somewhere.' } });
  });

  it('sends a document to the home the person chose', () => {
    const document = form({ fromDocument: true, category: 'ELECTRICITY', cadence: 'BIMONTHLY', periodStart: '2026-07-15', periodEnd: '2026-09-14' });
    const result = resolveExpense(document, phases, TODAY, 'madrid');
    expect(result.ok && result.kind === 'RECEIPT' && result.create.phaseId).toBe('madrid');
  });

  it('forgets an answer to "again?" when the frequency changes', () => {
    expect(withFrequency(form({ repeats: true }), 'ANNUAL').repeats).toBeNull();
  });
});

describe('what a PDF fills in', () => {
  it('pre-fills the form and marks it as read from a document', () => {
    const filled = expenseFormFromDraft(
      { amountMinor: 9650, currency: 'EUR', vendor: 'Iberdrola', category: 'ELECTRICITY', cadence: 'BIMONTHLY', periodStart: '2026-07-15', periodEnd: '2026-09-14' },
      'EUR',
      { today: TODAY, countryCode: 'ES', history: [] }
    );
    expect(filled).toMatchObject({ vendor: 'Iberdrola', category: 'ELECTRICITY', cadence: 'BIMONTHLY', amount: '96.50', periodStart: '2026-07-15', fromDocument: true });
  });

  it('leaves what the document did not say blank', () => {
    const filled = expenseFormFromDraft(
      { amountMinor: null, currency: null, vendor: null, category: null, cadence: null, periodStart: null, periodEnd: null },
      'EUR',
      { today: TODAY, countryCode: 'ES', history: [] }
    );
    expect(filled).toMatchObject({ vendor: '', category: null, cadence: null, amount: '', periodStart: '', periodEnd: '' });
  });
});
