import { useId, useRef, useState, type ReactNode } from 'react';
import type { CreateBillingRecordRequest, CreateFixedCostRequest, LivingPhaseDto } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { clampDateYear, keepDecimal } from '../../lib/inputFilters';
import { defaultExpensePhase } from '../../lib/phaseRouting';
import WizardModal from '../wizard/WizardModal';
import type { WizardStepInfo } from '../wizard/MilestoneBar';
import { withPeriod, withVendor, type BillField, type BillFormContext } from './billForm';
import CategoryChips from './CategoryChips';
import { describeDocumentFailure } from './describeDocument';
import {
  FREQUENCY_OPTIONS,
  datesRequired,
  resolveExpense,
  stepsFor,
  validateStep,
  withExpenseCategory,
  withFrequency,
  withOfferedDates,
  withSingleDay,
  withSpansDays,
  type ExpenseErrors,
  type ExpenseForm,
  type ExpenseStepId,
} from './expenseForm';
import SegmentedChoice from './SegmentedChoice';

export interface ExpenseStepsProps {
  initial: ExpenseForm;
  /** What a document did not say: each is outlined in yellow until it is filled in. */
  blanks?: readonly BillField[];
  phases: readonly LivingPhaseDto[];
  context: BillFormContext;
  /** True when a "How do you want to add it?" step comes before these, so the bar and Back account for it. */
  hasStartStep: boolean;
  onBackFromFirst?: () => void;
  /** A home chosen by the person for a document; otherwise the days decide. */
  chosenPhaseId?: string | null;
  /** Shown above the first step's fields: what a document needs the person to know. */
  notices?: ReactNode;
  /** Beside the form: the PDF being read. */
  preview?: ReactNode;
  /** "Bill 2 of 5 · factura.pdf" for a batch of PDFs. */
  progress?: string;
  onSkip?: () => void;
  onSubmitReceipt: (input: CreateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  onSubmitRate: (phase: LivingPhaseDto, input: CreateFixedCostRequest) => Promise<MutationResult<unknown>>;
  /** The expense was saved. */
  onSaved: () => void;
  onClose: () => void;
  /** Written beside the title: names what is being added. */
  title?: string;
}

const STEP_LABELS: Record<ExpenseStepId, string> = { who: 'Sender', amount: 'Amount', dates: 'Days', again: 'Check' };
const START_STEP: WizardStepInfo = { id: 'start', label: 'Start' };

const HEADINGS: Record<ExpenseStepId, string> = {
  who: 'Who sent it, and what is it for?',
  amount: 'How much, and how often does it come?',
  dates: 'Which days does it cover?',
  again: 'Will this come again?',
};

/** The questions of an expense, one step at a time. The answers decide how it is stored: nobody picks that. */
export default function ExpenseSteps({
  initial,
  blanks = [],
  phases,
  context,
  hasStartStep,
  onBackFromFirst,
  chosenPhaseId = null,
  notices,
  preview,
  progress,
  onSkip,
  onSubmitReceipt,
  onSubmitRate,
  onSaved,
  onClose,
  title = 'Add an expense',
}: ExpenseStepsProps) {
  const id = useId();
  const [form, setForm] = useState<ExpenseForm>(initial);
  const [step, setStep] = useState<ExpenseStepId>('who');
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const ids = stepsFor(form);
  const position = Math.max(ids.indexOf(step), 0);
  const isLast = position === ids.length - 1;
  const milestones: WizardStepInfo[] = [...(hasStartStep ? [START_STEP] : []), ...ids.map((stepId) => ({ id: stepId, label: STEP_LABELS[stepId] }))];

  const chosenPhase = chosenPhaseId === null ? null : (phases.find((phase) => phase.id === chosenPhaseId) ?? null);
  // Where the amount is read: the home chosen for a document, else the home a bill would go to today.
  const currency = (chosenPhase ?? defaultExpensePhase(phases, context.today ?? '') ?? phases[0]).currency;
  const blank = (field: BillField, filled: boolean) => blanks.includes(field) && !filled;
  const inputClass = (field: BillField, filled: boolean) => `form-input${blank(field, filled) ? ' is-unread' : ''}`;
  const update = (change: (current: ExpenseForm) => ExpenseForm) => setForm(change);

  const errorText = (key: keyof ExpenseErrors) =>
    errors[key] && (
      <p className="form-error-text" id={`${id}-${key}-error`} role="alert">
        {errors[key]}
      </p>
    );

  const save = async () => {
    if (submitting.current) return;
    const result = resolveExpense(form, phases, context.today, chosenPhaseId);
    if (!result.ok) {
      setErrors(result.errors);
      // An answer missing for an earlier step: go back to where it is asked.
      const back = result.errors.periodStart || result.errors.periodEnd ? 'dates' : result.errors.amount ? 'amount' : result.errors.repeats ? 'again' : null;
      if (back !== null && ids.includes(back)) setStep(back);
      return;
    }
    submitting.current = true;
    setBusy(true);
    const saved = result.kind === 'RATE' ? await onSubmitRate(result.phase, result.create) : await onSubmitReceipt(result.create);
    submitting.current = false;
    setBusy(false);
    if (saved.ok) onSaved();
    else setErrors({ form: describeDocumentFailure(saved.failure) });
  };

  const next = () => {
    const found = validateStep(step, form, currency);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (isLast) {
      void save();
      return;
    }
    const upcoming = ids[position + 1];
    if (upcoming === 'dates') setForm((current) => withOfferedDates(current, context.today));
    setStep(upcoming);
  };

  const back = () => {
    setErrors({});
    if (position === 0) onBackFromFirst?.();
    else setStep(ids[position - 1]);
  };

  const setDate = (field: 'periodStart' | 'periodEnd', value: string) =>
    update((current) => {
      const day = clampDateYear(value);
      if (current.cadence === 'ONE_OFF' && !current.spansDays) return withSingleDay(current, day);
      // With no frequency yet (a document that did not say), the days tell it.
      return current.cadence === null ? { ...current, ...withPeriod(current, field, day) } : { ...current, [field]: day };
    });

  const fields = (
    <>
      {step === 'who' && (
        <>
          {notices}
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-vendor`}>
              Who sent it?
            </label>
            <input
              id={`${id}-vendor`}
              className={inputClass('vendor', form.vendor.trim() !== '')}
              autoComplete="off"
              maxLength={80}
              placeholder="Company / Provider"
              value={form.vendor}
              onChange={(event) =>
                // No days are made up while typing: they are offered on their own step.
                update((current) => ({ ...current, ...withVendor(current, event.target.value, { ...context, today: null }), repeats: null }))
              }
              aria-invalid={errors.vendor !== undefined || undefined}
              aria-describedby={errors.vendor ? `${id}-vendor-error` : undefined}
            />
            {errorText('vendor')}
          </div>
          <CategoryChips
            name={`${id}-category`}
            value={form.category}
            onChange={(category) => update((current) => withExpenseCategory(current, category))}
            legend="What is it for?"
            invalid={errors.category !== undefined}
            errorId={errors.category ? `${id}-category-error` : undefined}
            unread={blank('category', form.category !== null)}
          />
          {errorText('category')}
        </>
      )}

      {step === 'amount' && (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-amount`}>
              Total on the bill
            </label>
            <input
              id={`${id}-amount`}
              className={inputClass('amount', form.amount.trim() !== '')}
              inputMode="decimal"
              autoComplete="off"
              placeholder="96.50"
              value={form.amount}
              onChange={(event) => update((current) => ({ ...current, amount: keepDecimal(event.target.value) }))}
              aria-invalid={errors.amount !== undefined || undefined}
              aria-describedby={errors.amount ? `${id}-amount-error` : undefined}
            />
            {errorText('amount')}
          </div>
          <SegmentedChoice
            name={`${id}-frequency`}
            legend="How often does it come?"
            options={FREQUENCY_OPTIONS}
            value={form.cadence}
            onChange={(cadence) => update((current) => withFrequency(current, cadence))}
            unread={blank('cadence', form.cadence !== null)}
          />
          {errorText('cadence')}
        </>
      )}

      {step === 'dates' && (
        <>
          {form.cadence === 'ONE_OFF' && (
            <SegmentedChoice
              name={`${id}-span`}
              legend="Does it cover one day or several?"
              options={[
                { value: 'single', label: 'A single day' },
                { value: 'several', label: 'Covers several days' },
              ]}
              value={form.spansDays ? 'several' : 'single'}
              onChange={(choice) => update((current) => withSpansDays(current, choice === 'several'))}
            />
          )}
          <div className="cost-editor__row">
            <div className="form-group">
              <label className="form-label" htmlFor={`${id}-periodStart`}>
                {form.cadence === 'ONE_OFF' && !form.spansDays ? 'The day it was paid' : 'Covers from'}
              </label>
              <input
                id={`${id}-periodStart`}
                type="date"
                className={inputClass('periodStart', form.periodStart !== '')}
                value={form.periodStart}
                onChange={(event) => setDate('periodStart', event.target.value)}
                aria-invalid={errors.periodStart !== undefined || undefined}
                aria-describedby={errors.periodStart ? `${id}-periodStart-error` : undefined}
              />
              {errorText('periodStart')}
            </div>
            {!(form.cadence === 'ONE_OFF' && !form.spansDays) && (
              <div className="form-group">
                <label className="form-label" htmlFor={`${id}-periodEnd`}>
                  Until
                </label>
                <input
                  id={`${id}-periodEnd`}
                  type="date"
                  className={inputClass('periodEnd', form.periodEnd !== '')}
                  value={form.periodEnd}
                  onChange={(event) => setDate('periodEnd', event.target.value)}
                  aria-invalid={errors.periodEnd !== undefined || undefined}
                  aria-describedby={errors.periodEnd ? `${id}-periodEnd-error` : undefined}
                />
                {errorText('periodEnd')}
              </div>
            )}
          </div>
        </>
      )}

      {step === 'again' && (
        <>
          <SegmentedChoice
            name={`${id}-again`}
            legend="Will this come again?"
            options={[
              { value: 'yes', label: 'Yes, it repeats' },
              { value: 'no', label: 'No, only this once' },
            ]}
            value={form.repeats === null ? null : form.repeats ? 'yes' : 'no'}
            onChange={(choice) => update((current) => ({ ...current, repeats: choice === 'yes' }))}
          />
          {errorText('repeats')}
        </>
      )}

      {onSkip && (
        <button type="button" className="profile-text-button expense-wizard__skip" onClick={onSkip} disabled={busy}>
          Skip this one
        </button>
      )}
    </>
  );

  const hints: Partial<Record<ExpenseStepId, string>> = {
    dates: !datesRequired(form)
      ? 'Optional. Leave both empty if it simply repeats, or add the days to log a bill you already received.'
      : form.cadence === 'ONE_OFF'
        ? undefined
        : 'We suggested the latest period. Change it to match the bill.',
    again: 'A repeating bill is averaged with the other ones in this home. A one-time bill is not.',
  };

  return (
    <WizardModal
      title={progress ? `${title} · ${progress}` : title}
      steps={milestones}
      stepIndex={(hasStartStep ? 1 : 0) + position}
      heading={step === 'dates' && form.cadence === 'ONE_OFF' ? 'When was it paid?' : HEADINGS[step]}
      hint={hints[step]}
      error={errors.form}
      busy={busy}
      finishLabel={initial.fromDocument ? 'Log bill' : 'Add expense'}
      wide={preview !== undefined}
      onBack={back}
      onNext={next}
      onClose={onClose}
    >
      {preview ? (
        <div className="expense-wizard__with-preview">
          <div className="expense-wizard__preview">{preview}</div>
          <div className="expense-wizard__form">{fields}</div>
        </div>
      ) : (
        fields
      )}
    </WizardModal>
  );
}

