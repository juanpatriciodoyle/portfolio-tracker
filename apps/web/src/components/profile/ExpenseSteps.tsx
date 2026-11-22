import type { MessageKey } from '../../i18n/catalogs';
import { useTranslation } from '../../i18n/useTranslation';
import { useId, useState, type ReactNode } from 'react';
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
  frequencyOptions,
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
import { useSubmitOnce } from '../../hooks/useSubmitOnce';

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

const STEP_LABELS: Record<ExpenseStepId, MessageKey> = { who: 'expense.step.who', amount: 'expense.step.amount', dates: 'expense.step.dates', again: 'expense.step.again' };

const HEADINGS: Record<ExpenseStepId, MessageKey> = {
  who: 'expense.heading.who',
  amount: 'expense.heading.amount',
  dates: 'expense.heading.dates',
  again: 'expense.heading.again',
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
  title,
}: ExpenseStepsProps) {
  const { t } = useTranslation();
  const id = useId();
  const heading = title ?? t('bill.addExpense');
  const [form, setForm] = useState<ExpenseForm>(initial);
  const [step, setStep] = useState<ExpenseStepId>('who');
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const { run, pending: busy } = useSubmitOnce();

  const ids = stepsFor(form);
  const position = Math.max(ids.indexOf(step), 0);
  const isLast = position === ids.length - 1;
  const milestones: WizardStepInfo[] = [
    ...(hasStartStep ? [{ id: 'start', label: t('expense.step.start') }] : []),
    ...ids.map((stepId) => ({ id: stepId, label: t(STEP_LABELS[stepId]) })),
  ];

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
    const result = resolveExpense(form, phases, context.today, chosenPhaseId, t);
    if (!result.ok) {
      setErrors(result.errors);
      // An answer missing for an earlier step: go back to where it is asked.
      const back = result.errors.periodStart || result.errors.periodEnd ? 'dates' : result.errors.amount ? 'amount' : result.errors.repeats ? 'again' : null;
      if (back !== null && ids.includes(back)) setStep(back);
      return;
    }
    await run(async () => {
      const saved = result.kind === 'RATE' ? await onSubmitRate(result.phase, result.create) : await onSubmitReceipt(result.create);
      if (saved.ok) onSaved();
      else setErrors({ form: describeDocumentFailure(saved.failure) });
    });
  };

  const next = () => {
    const found = validateStep(step, form, currency, t);
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
              {t('expense.who')}
            </label>
            <input
              id={`${id}-vendor`}
              className={inputClass('vendor', form.vendor.trim() !== '')}
              autoComplete="off"
              maxLength={80}
              placeholder={t('form.companyPlaceholder')}
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
            legend={t('category.legend')}
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
              {t('bill.total')}
            </label>
            <input
              id={`${id}-amount`}
              className={inputClass('amount', form.amount.trim() !== '')}
              inputMode="decimal"
              autoComplete="off"
              placeholder={t('bill.totalPlaceholder')}
              value={form.amount}
              onChange={(event) => update((current) => ({ ...current, amount: keepDecimal(event.target.value) }))}
              aria-invalid={errors.amount !== undefined || undefined}
              aria-describedby={errors.amount ? `${id}-amount-error` : undefined}
            />
            {errorText('amount')}
          </div>
          <SegmentedChoice
            name={`${id}-frequency`}
            legend={t('expense.howOften')}
            options={frequencyOptions(t)}
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
              legend={t('expense.span')}
              options={[
                { value: 'single', label: t('expense.single') },
                { value: 'several', label: t('expense.several') },
              ]}
              value={form.spansDays ? 'several' : 'single'}
              onChange={(choice) => update((current) => withSpansDays(current, choice === 'several'))}
            />
          )}
          <div className="cost-editor__row">
            <div className="form-group">
              <label className="form-label" htmlFor={`${id}-periodStart`}>
                {form.cadence === 'ONE_OFF' && !form.spansDays ? t('expense.paidDay') : t('bill.coversFrom')}
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
                  {t('bill.until')}
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
            legend={t('expense.heading.again')}
            options={[
              { value: 'yes', label: t('expense.againYes') },
              { value: 'no', label: t('expense.againNo') },
            ]}
            value={form.repeats === null ? null : form.repeats ? 'yes' : 'no'}
            onChange={(choice) => update((current) => ({ ...current, repeats: choice === 'yes' }))}
          />
          {errorText('repeats')}
        </>
      )}

      {onSkip && (
        <button type="button" className="profile-text-button expense-wizard__skip" onClick={onSkip} disabled={busy}>
          {t('expense.skip')}
        </button>
      )}
    </>
  );

  const hints: Partial<Record<ExpenseStepId, string>> = {
    dates: !datesRequired(form)
      ? t('expense.hint.optional')
      : form.cadence === 'ONE_OFF'
        ? undefined
        : t('expense.hint.suggested'),
    again: t('expense.hint.again'),
  };

  return (
    <WizardModal
      title={progress ? `${heading} · ${progress}` : heading}
      steps={milestones}
      stepIndex={(hasStartStep ? 1 : 0) + position}
      heading={step === 'dates' && form.cadence === 'ONE_OFF' ? t('expense.heading.paid') : t(HEADINGS[step])}
      hint={hints[step]}
      error={errors.form}
      busy={busy}
      finishLabel={initial.fromDocument ? t('expense.logBill') : t('bill.saveExpense')}
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

