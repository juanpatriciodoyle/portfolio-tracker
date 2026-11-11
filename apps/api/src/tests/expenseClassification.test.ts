import { classifyExpense, type ExpenseAnswers } from '../contracts/expenseClassification';
import { BILLING_CADENCES, FIXED_COST_CATEGORIES, VARIABLE_COST_CATEGORIES } from '../contracts/vocabulary';

const answers = (overrides: Partial<ExpenseAnswers> = {}): ExpenseAnswers => ({
  category: 'RENT',
  cadence: 'MONTHLY',
  hasDates: false,
  fromDocument: false,
  repeats: null,
  ...overrides,
});

describe('classifyExpense: what is stored is decided by the answers, never by a picker', () => {
  it('stores rent that repeats, with no days, as a declared rate', () => {
    expect(classifyExpense(answers())).toEqual({ kind: 'RECURRING_RATE', cadence: 'MONTHLY' });
  });

  it.each(['RENT', 'INTERNET', 'PHONE', 'SUBSCRIPTIONS', 'OTHER'] as const)('keeps the cadence of a declared %s rate', (category) => {
    expect(classifyExpense(answers({ category, cadence: 'QUARTERLY' }))).toEqual({ kind: 'RECURRING_RATE', cadence: 'QUARTERLY' });
  });

  it.each(VARIABLE_COST_CATEGORIES)('always stores %s as a receipt: its amount changes every time', (category) => {
    expect(classifyExpense(answers({ category, cadence: 'BIMONTHLY', hasDates: true }))).toEqual({ kind: 'RECEIPT', cadence: 'BIMONTHLY' });
    expect(classifyExpense(answers({ category, cadence: 'BIMONTHLY', hasDates: false }))).toEqual({ kind: 'RECEIPT', cadence: 'BIMONTHLY' });
  });

  it('stores anything read from a document as a receipt, whatever the category', () => {
    for (const category of FIXED_COST_CATEGORIES) {
      expect(classifyExpense(answers({ category, hasDates: true, fromDocument: true })).kind).toBe('RECEIPT');
    }
  });

  it.each(FIXED_COST_CATEGORIES)('stores a one-time %s as a one-off receipt, never as a rate', (category) => {
    expect(classifyExpense(answers({ category, cadence: 'ONE_OFF' }))).toEqual({ kind: 'RECEIPT', cadence: 'ONE_OFF' });
    expect(classifyExpense(answers({ category, cadence: 'ONE_OFF', hasDates: true }))).toEqual({ kind: 'RECEIPT', cadence: 'ONE_OFF' });
  });

  it('asks whether a dated rent will come again, because the days alone do not say', () => {
    expect(classifyExpense(answers({ hasDates: true }))).toEqual({ kind: 'ASK_REPEATS' });
  });

  it('keeps the cadence of a dated bill the person says repeats', () => {
    expect(classifyExpense(answers({ hasDates: true, repeats: true, cadence: 'BIMONTHLY' }))).toEqual({ kind: 'RECEIPT', cadence: 'BIMONTHLY' });
  });

  it('makes a dated bill the person says does not repeat a one-off', () => {
    expect(classifyExpense(answers({ hasDates: true, repeats: false }))).toEqual({ kind: 'RECEIPT', cadence: 'ONE_OFF' });
  });

  it('does not ask when the answer cannot change anything', () => {
    for (const cadence of BILLING_CADENCES) {
      expect(classifyExpense(answers({ category: 'ELECTRICITY', cadence, hasDates: true })).kind).toBe('RECEIPT');
    }
    expect(classifyExpense(answers({ cadence: 'ONE_OFF', hasDates: true })).kind).toBe('RECEIPT');
  });
});
