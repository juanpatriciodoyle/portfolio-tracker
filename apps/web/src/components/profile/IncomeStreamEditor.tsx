import { useId, useState, type FormEvent } from 'react';
import type { IncomeStreamDto, LivingPhaseDto } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { clampDateYear, keepDecimal } from '../../lib/inputFilters';
import { describeFailure } from './failureMessage';
import {
  emptyIncomeStreamForm,
  incomeStreamFormFrom,
  validateIncomeStream,
  type IncomeStreamErrors,
  type IncomeStreamForm,
} from './incomeForm';

interface IncomeStreamEditorProps {
  phase: Pick<LivingPhaseDto, 'startDate' | 'endDate' | 'currency'>;
  /** Present when changing a stream that was already added. */
  initial?: IncomeStreamDto;
  onSubmit: (stream: IncomeStreamDto) => Promise<MutationResult<unknown>>;
  onCancel: () => void;
}

/** Add, or correct, one source of income within a home: a job, freelance work, a pension. */
export default function IncomeStreamEditor({ phase, initial, onSubmit, onCancel }: IncomeStreamEditorProps) {
  const id = useId();
  const [form, setForm] = useState<IncomeStreamForm>(() => (initial ? incomeStreamFormFrom(initial, phase.currency) : emptyIncomeStreamForm(phase)));
  const [errors, setErrors] = useState<IncomeStreamErrors & { form?: string }>({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateIncomeStream(form, phase.currency, phase);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setSaving(true);
    const saved = await onSubmit(result.stream);
    setSaving(false);
    if (!saved.ok) setErrors({ form: describeFailure(saved.failure) });
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

  return (
    <form className="cost-editor" onSubmit={handleSubmit} noValidate aria-label={initial ? 'Edit income' : 'Add income'}>
      <div className="cost-editor__row">
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-label`}>
            Role or source
          </label>
          <input
            id={`${id}-label`}
            className="form-input"
            autoComplete="off"
            maxLength={60}
            placeholder="Salary"
            value={form.label}
            onChange={set('label')}
            aria-invalid={errors.label !== undefined || undefined}
            aria-describedby={describedBy('label')}
          />
          {fieldError('label')}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-amount`}>
            Net per month
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
            From
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
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-end`}>
            Until (optional)
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
      </div>

      {errors.form && (
        <p className="form-error-text" role="alert">
          {errors.form}
        </p>
      )}

      <div className="cost-editor__actions">
        <button type="submit" className="btn-primary-apply" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add income'}
        </button>
        <button type="button" className="btn-secondary-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
