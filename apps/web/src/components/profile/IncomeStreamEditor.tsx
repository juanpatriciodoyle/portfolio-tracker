import { type Translate } from '../../i18n/translate';
import { useTranslation } from '../../i18n/useTranslation';
import { useId, useState, type FormEvent } from 'react';
import type { IncomeStreamDto, LivingPhaseDto } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { clampDateYear, keepDecimal } from '../../lib/inputFilters';
import { describeFailure } from './failureMessage';
import SegmentedChoice from './SegmentedChoice';
import {
  endReasonOptions,
  emptyIncomeStreamForm,
  incomeStreamFormFrom,
  validateIncomeStream,
  type IncomeStreamErrors,
  type IncomeKind,
  type IncomeStreamForm,
} from './incomeForm';
import { useSubmitOnce } from '../../hooks/useSubmitOnce';

const kindOptions = (t: Translate): readonly { value: IncomeKind; label: string }[] => [
  { value: 'MONTHLY', label: t('income.kind.monthly') },
  { value: 'ONE_TIME', label: t('income.kind.once') },
];

interface IncomeStreamEditorProps {
  phase: Pick<LivingPhaseDto, 'startDate' | 'endDate' | 'currency'>;
  /** Present when changing a stream that was already added. */
  initial?: IncomeStreamDto;
  onSubmit: (stream: IncomeStreamDto) => Promise<MutationResult<unknown>>;
  onCancel: () => void;
}

/** Add, or correct, one source of income within a home: a job, freelance work, a pension. */
export default function IncomeStreamEditor({ phase, initial, onSubmit, onCancel }: IncomeStreamEditorProps) {
  const words = useTranslation();
  const { t } = words;
  const id = useId();
  const [form, setForm] = useState<IncomeStreamForm>(() => (initial ? incomeStreamFormFrom(initial, phase.currency) : emptyIncomeStreamForm(phase)));
  const [errors, setErrors] = useState<IncomeStreamErrors & { form?: string }>({});
  const { run, pending: saving } = useSubmitOnce();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateIncomeStream(form, phase.currency, phase, t);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    await run(async () => {
      const saved = await onSubmit(result.stream);
      if (!saved.ok) setErrors({ form: describeFailure(saved.failure, [], words) });
    });
  };

  const describedBy = (field: keyof IncomeStreamErrors) => (errors[field] ? `${id}-${field}-error` : undefined);
  const fieldError = (field: keyof IncomeStreamErrors) =>
    errors[field] && (
      <p className="form-error-text" id={`${id}-${field}-error`} role="alert">
        {errors[field]}
      </p>
    );
  const setFiltered = (field: keyof IncomeStreamForm, filter: (value: string) => string) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: filter(event.target.value) }));
  const set = (field: keyof IncomeStreamForm) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const once = form.kind === 'ONE_TIME';

  return (
    <form className="cost-editor" onSubmit={handleSubmit} noValidate aria-label={initial ? t('income.editIncome') : t('income.addJob')}>
      <SegmentedChoice name={`${id}-kind`} legend={t('income.howPaid')} options={kindOptions(t)} value={form.kind} onChange={(kind) => setForm((current) => ({ ...current, kind }))} />

      <div className="cost-editor__row">
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-label`}>
            {t('income.role')}
          </label>
          <input
            id={`${id}-label`}
            className="form-input"
            autoComplete="off"
            maxLength={60}
            placeholder={t('income.rolePlaceholder')}
            value={form.label}
            onChange={set('label')}
            aria-invalid={errors.label !== undefined || undefined}
            aria-describedby={describedBy('label')}
          />
          {fieldError('label')}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-amount`}>
            {once ? t('income.amountReceived') : t('income.netPerMonth')}
          </label>
          <input
            id={`${id}-amount`}
            className="form-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="3500"
            value={form.amount}
            onChange={setFiltered('amount', keepDecimal)}
            aria-invalid={errors.amount !== undefined || undefined}
            aria-describedby={describedBy('amount')}
          />
          {fieldError('amount')}
        </div>
      </div>

      <div className="cost-editor__row">
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-start`}>
            {once ? t('income.dateReceived') : t('income.from')}
          </label>
          <input
            id={`${id}-start`}
            type="date"
            className="form-input"
            value={form.startDate}
            onChange={setFiltered('startDate', clampDateYear)}
            aria-invalid={errors.startDate !== undefined || undefined}
            aria-describedby={describedBy('startDate')}
          />
          {fieldError('startDate')}
        </div>
        {!once && (
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-end`}>
              {t('income.lastDayOptional')}
            </label>
            <input
              id={`${id}-end`}
              type="date"
              className="form-input"
              value={form.endDate}
              onChange={setFiltered('endDate', clampDateYear)}
              aria-invalid={errors.endDate !== undefined || undefined}
              aria-describedby={describedBy('endDate')}
            />
            {fieldError('endDate')}
          </div>
        )}
      </div>

      {!once && form.endDate !== '' && (
        <SegmentedChoice
          name={`${id}-reason`}
          legend={t('income.whatHappenedOptional')}
          options={endReasonOptions(t)}
          value={form.endReason === '' ? null : form.endReason}
          onChange={(endReason) => setForm((current) => ({ ...current, endReason }))}
        />
      )}

      {errors.form && (
        <p className="form-error-text" role="alert">
          {errors.form}
        </p>
      )}

      <div className="cost-editor__actions">
        <button type="submit" className="btn-primary-apply" disabled={saving} aria-busy={saving}>
          {saving ? t('fixedCost.saving') : initial ? t('fixedCost.save') : once ? t('income.addDeposit') : t('income.addIncome')}
        </button>
        <button type="button" className="btn-secondary-cancel" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
