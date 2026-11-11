import {
  calendarDateSchema,
  classifyExpense,
  createFixedCostRequest,
  isVariableCategory,
  maxPeriodDays,
  periodEndingOn,
  periodFitsCadence,
  type BillingCadence,
  type BillingDraft,
  type CostCadence,
  type CreateBillingRecordRequest,
  type CreateFixedCostRequest,
  type FixedCostCategory,
  type LivingPhaseDto,
} from '../../contracts';
import { parseMajorToMinor } from '../../lib/money';
import { defaultExpensePhase, phaseCoveringDay } from '../../lib/phaseRouting';
import { emptyBillForm, validateBill, type BillForm, type BillFormContext } from './billForm';
import { reviewFormFrom } from './documentForm';
import { BILLING_CADENCE_PHRASES } from './labels';

/** What the "Add an expense" wizard holds: the bill form, plus what only the wizard asks. */
export interface ExpenseForm extends BillForm {
  /** A one-time expense covering several days (a month-long stay) rather than the one day it was paid. */
  spansDays: boolean;
  /** The answer to "Will this come again?"; null until it is asked. */
  repeats: boolean | null;
  /** Read from a PDF. */
  fromDocument: boolean;
}

export type ExpenseStepId = 'who' | 'amount' | 'dates' | 'again';
export type ExpenseErrors = Partial<Record<'category' | 'vendor' | 'amount' | 'cadence' | 'periodStart' | 'periodEnd' | 'repeats' | 'form', string>>;

/** How often it comes, in the words a person uses. `ONE_OFF` is "one time only". */
export const FREQUENCY_OPTIONS: readonly { value: BillingCadence; label: string }[] = [
  { value: 'MONTHLY', label: 'Every month' },
  { value: 'BIMONTHLY', label: 'Every 2 months' },
  { value: 'QUARTERLY', label: 'Every 3 months' },
  { value: 'SEMI_ANNUALLY', label: 'Every 6 months' },
  { value: 'ANNUAL', label: 'Every year' },
  { value: 'ONE_OFF', label: 'One time only' },
];

export function emptyExpenseForm(): ExpenseForm {
  return { ...emptyBillForm(), spansDays: false, repeats: null, fromDocument: false };
}

/** What a PDF said is filled in; what it did not say stays blank (the wizard flags it). */
export function expenseFormFromDraft(draft: BillingDraft, currency: string, context: BillFormContext): ExpenseForm {
  const read = reviewFormFrom(draft, currency, context);
  return { ...read, spansDays: read.cadence === 'ONE_OFF' && read.periodStart !== read.periodEnd, repeats: null, fromDocument: true };
}

const isDate = (value: string) => calendarDateSchema.safeParse(value).success;
const hasBothDates = (form: ExpenseForm) => form.periodStart !== '' && form.periodEnd !== '';

/** The person picks how often it comes. No days are made up here: they are offered on the dates step. */
export function withFrequency(form: ExpenseForm, cadence: BillingCadence): ExpenseForm {
  return { ...form, cadence, suggested: { ...form.suggested, cadence: false }, repeats: null };
}

/** The category changes what the next steps ask, so an earlier answer to "again?" no longer applies. */
export function withExpenseCategory(form: ExpenseForm, category: FixedCostCategory): ExpenseForm {
  return { ...form, category, suggested: { ...form.suggested, category: false }, repeats: null };
}

/** Whether the days are a must: a bill that changes every time, a one-time expense, or a document. Otherwise they are optional. */
export const datesRequired = (form: ExpenseForm): boolean =>
  form.fromDocument || form.cadence === 'ONE_OFF' || (form.category !== null && isVariableCategory(form.category));

/** A one-time expense on a single day: the days are that day, twice. */
export function withSingleDay(form: ExpenseForm, day: string): ExpenseForm {
  return { ...form, periodStart: day, periodEnd: day };
}

/** The one-time expense covers one day, or several. */
export function withSpansDays(form: ExpenseForm, spansDays: boolean): ExpenseForm {
  return { ...form, spansDays, ...(spansDays ? {} : { periodEnd: form.periodStart }) };
}

/**
 * Arriving on the dates step with nothing there yet, the days are offered when they are a must: the bill's
 * own period ending today, or today for a one-time expense. A document's blanks are never filled in silently.
 */
export function withOfferedDates(form: ExpenseForm, today: string | null): ExpenseForm {
  if (today === null || form.fromDocument || form.cadence === null || !datesRequired(form) || form.periodStart !== '' || form.periodEnd !== '') return form;
  if (form.cadence === 'ONE_OFF') return withSingleDay(form, today);
  return { ...form, ...periodEndingOn(form.cadence, today) };
}

/** The days are given when both ends are (a single day counts as both). */
export const hasDates = (form: ExpenseForm): boolean => hasBothDates(form);

/** The steps this expense needs: "Will this come again?" is only asked when the answers leave it open. */
export function stepsFor(form: ExpenseForm): ExpenseStepId[] {
  const steps: ExpenseStepId[] = ['who', 'amount', 'dates'];
  if (asksIfItRepeats(form)) steps.push('again');
  return steps;
}

export function asksIfItRepeats(form: ExpenseForm): boolean {
  if (form.category === null || form.cadence === null) return false;
  return classifyExpense({ category: form.category, cadence: form.cadence, hasDates: hasDates(form), fromDocument: form.fromDocument, repeats: null }).kind === 'ASK_REPEATS';
}

/** Checks one step like a person would, so a mistake is caught where it was made. */
export function validateStep(step: ExpenseStepId, form: ExpenseForm, currency: string): ExpenseErrors {
  const errors: ExpenseErrors = {};
  if (step === 'who') {
    if (form.vendor.trim() === '') errors.vendor = 'Who sent it?';
    if (form.category === null) errors.category = 'Pick what this is for.';
  } else if (step === 'amount') {
    if (parseMajorToMinor(form.amount, currency) === null) errors.amount = 'Enter an amount such as 96 or 96.50.';
    if (form.cadence === null) errors.cadence = 'Pick how often it comes.';
  } else if (step === 'dates') {
    const single = form.cadence === 'ONE_OFF' && !form.spansDays;
    if (datesRequired(form) || form.periodStart !== '' || form.periodEnd !== '') {
      if (!isDate(form.periodStart)) errors.periodStart = single ? 'Pick the day it was paid.' : 'Pick the first day it covers.';
      if (!single && !isDate(form.periodEnd)) errors.periodEnd = 'Pick the last day it covers.';
      if (!errors.periodStart && !errors.periodEnd && !single) {
        if (form.periodEnd < form.periodStart) errors.periodEnd = 'It cannot end before it starts.';
        else if (form.cadence !== null && !periodFitsCadence(form.cadence, form.periodStart, form.periodEnd)) {
          errors.periodEnd = `Something that comes ${BILLING_CADENCE_PHRASES[form.cadence]} can cover at most ${maxPeriodDays(form.cadence)} days. Pick another frequency or shorten the days.`;
        }
      }
    }
  } else if (form.repeats === null) {
    errors.repeats = 'Pick one.';
  }
  return errors;
}

export type ExpenseResolution =
  | { ok: true; kind: 'RECEIPT'; create: CreateBillingRecordRequest }
  | { ok: true; kind: 'RATE'; phase: LivingPhaseDto; create: CreateFixedCostRequest }
  | { ok: false; errors: ExpenseErrors };

/**
 * What the answers add up to: a bill that arrived, in the home its first day falls in (never guessed: no home
 * covering it is an error), or the rate something costs, in the home lived in today. `phaseId` is a home the
 * person chose themselves for a PDF.
 */
export function resolveExpense(
  form: ExpenseForm,
  phases: readonly LivingPhaseDto[],
  today: string | null,
  chosenPhaseId: string | null = null
): ExpenseResolution {
  if (form.category === null || form.cadence === null) return { ok: false, errors: { form: 'Check the details and try again.' } };

  const outcome = classifyExpense({ category: form.category, cadence: form.cadence, hasDates: hasDates(form), fromDocument: form.fromDocument, repeats: form.repeats });
  if (outcome.kind === 'ASK_REPEATS') return { ok: false, errors: { repeats: 'Pick one.' } };

  if (outcome.kind === 'RECURRING_RATE') {
    const phase = defaultExpensePhase(phases, today ?? '');
    if (phase === null) return { ok: false, errors: { form: 'Add a living phase first.' } };
    const amountMinor = parseMajorToMinor(form.amount, phase.currency);
    if (amountMinor === null) return { ok: false, errors: { amount: 'Enter an amount such as 96 or 96.50.' } };
    const parsed = createFixedCostRequest.safeParse({ category: form.category, cadence: outcome.cadence satisfies CostCadence, amountMinor, label: form.vendor.trim() });
    return parsed.success ? { ok: true, kind: 'RATE', phase, create: parsed.data } : { ok: false, errors: { form: 'Check the details and try again.' } };
  }

  const phase = chosenPhaseId !== null ? (phases.find((candidate) => candidate.id === chosenPhaseId) ?? null) : phaseCoveringDay(phases, form.periodStart);
  if (phase === null) return { ok: false, errors: { periodStart: 'No living phase covers that day. Pick a day you lived somewhere.' } };
  const result = validateBill({ ...form, cadence: outcome.cadence }, phase.id, phase.currency);
  return result.ok ? { ok: true, kind: 'RECEIPT', create: result.create } : { ok: false, errors: result.errors };
}
