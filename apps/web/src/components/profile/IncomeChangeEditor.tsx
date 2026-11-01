import { useId, useState, type FormEvent } from 'react';
import { INCOME_REASONS, type IncomeChangeDto, type LivingPhaseDto } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { describeFailure } from './failureMessage';
import {
  emptyIncomeForm,
  incomeFormFrom,
  validateIncomeChange,
  withIncomeReason,
  type IncomeChangeErrors,
  type IncomeChangeForm,
} from './incomeForm';
import { INCOME_REASON_LABELS } from './labels';

interface IncomeChangeEditorProps {
  phase: Pick<LivingPhaseDto, 'startDate' | 'endDate' | 'currency'>;
  /** Present when changing an income change that was already added. */
  initial?: IncomeChangeDto;
  onSubmit: (change: IncomeChangeDto) => Promise<MutationResult<unknown>>;
  onCancel: () => void;
}

/** Add, or correct, a stretch of a different income within a home: a raise, a new job, a spell without work. */
export default function IncomeChangeEditor({ phase, initial, onSubmit, onCancel }: IncomeChangeEditorProps) {
  const id = useId();
  const [form, setForm] = useState<IncomeChangeForm>(() => (initial ? incomeFormFrom(initial, phase.currency) : emptyIncomeForm()));
  const [errors, setErrors] = useState<IncomeChangeErrors & { form?: string }>({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateIncomeChange(form, phase.currency, phase);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setSaving(true);
    const saved = await onSubmit(result.change);
    setSaving(false);
    if (!saved.ok) setErrors({ form: describeFailure(saved.failure) });
  };

  const describedBy = (field: keyof IncomeChangeErrors) => (errors[field] ? `${id}-${field}-error` : undefined);
  const fieldError = (field: keyof IncomeChangeErrors) =>
    errors[field] && (
      <p className="form-error-text" id={`${id}-${field}-error`} role="alert">
        {errors[field]}
      </p>
    );

  return (
    <form className="cost-editor" onSubmit={handleSubmit} noValidate aria-label={initial ? 'Edit income change' : 'Add an income change'}>
      <fieldset className="profile-segmented">
        <legend className="form-label">What changed? (optional)</legend>
        <div className="income-reasons">
          {INCOME_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              className={`profile-toggle-button${form.reason === reason ? ' is-on' : ''}`}
              aria-pressed={form.reason === reason}
              onClick={() => setForm((current) => withIncomeReason(current, reason))}
            >
              {INCOME_REASON_LABELS[reason]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="form-group">
        <label className="form-label" htmlFor={`${id}-amount`}>
          Monthly income from then
        </label>
        <input
          id={`${id}-amount`}
          className="form-input"
          inputMode="decimal"
          autoComplete="off"
          placeholder="3500"
          value={form.amount}
          onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
          aria-invalid={errors.amount !== undefined || undefined}
          aria-describedby={describedBy('amount')}
        />
        {fieldError('amount')}
      </div>

      <div className="cost-editor__row">
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-start`}>
            From
          </label>
          <input
            id={`${id}-start`}
            type="date"
            className="form-input"
            value={form.startDate}
            onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
            aria-invalid={errors.startDate !== undefined || undefined}
            aria-describedby={describedBy('startDate')}
          />
          {fieldError('startDate')}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-end`}>
            Until (optional)
          </label>
          <input
            id={`${id}-end`}
            type="date"
            className="form-input"
            value={form.endDate}
            onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
            aria-invalid={errors.endDate !== undefined || undefined}
            aria-describedby={describedBy('endDate')}
          />
          {fieldError('endDate')}
        </div>
      </div>

      {errors.form && (
        <p className="form-error-text" role="alert">
          {errors.form}
        </p>
      )}

      <div className="cost-editor__actions">
        <button type="submit" className="btn-primary-apply" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add income change'}
        </button>
        <button type="button" className="btn-secondary-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
