import { useId, useState, type FormEvent } from 'react';
import type { BillingRecordDto, CreateBillingRecordRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { billFormFrom, emptyBillForm, validateBill, type BillErrors, type BillForm } from './billForm';
import CategoryChips from './CategoryChips';
import { describeFailure } from './failureMessage';
import { BILLING_CADENCE_OPTIONS } from './labels';
import SegmentedChoice from './SegmentedChoice';

interface BillEditorProps {
  phaseId: string;
  currency: string;
  /** Today as the server sees it, so a new bill starts with last month's dates. */
  asOf: string | null;
  /** Present when changing a bill that was already logged. */
  initial?: BillingRecordDto;
  onSubmit: (input: CreateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  onCancel: () => void;
}

/** Log, or correct, one bill that actually arrived: who sent it, what it cost, and what it covers. */
export default function BillEditor({ phaseId, currency, asOf, initial, onSubmit, onCancel }: BillEditorProps) {
  const id = useId();
  const [form, setForm] = useState<BillForm>(() => (initial ? billFormFrom(initial) : emptyBillForm(asOf)));
  const [errors, setErrors] = useState<BillErrors>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof BillForm>(key: K, value: BillForm[K]) => setForm((previous) => ({ ...previous, [key]: value }));
  const describedBy = (field: keyof BillErrors) => (errors[field] ? `${id}-${field}-error` : undefined);
  const fieldError = (field: keyof BillErrors) =>
    errors[field] && (
      <p className="form-error-text" id={`${id}-${field}-error`} role="alert">
        {errors[field]}
      </p>
    );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateBill(form, phaseId, currency);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setSaving(true);
    const saved = await onSubmit(result.create);
    setSaving(false);
    if (!saved.ok) setErrors({ form: describeFailure(saved.failure) });
  };

  return (
    <form className="cost-editor bill-editor" onSubmit={handleSubmit} noValidate aria-label={initial ? 'Edit bill' : 'Log a bill'}>
      <CategoryChips
        name={`${id}-category`}
        value={form.category}
        onChange={(category) => set('category', category)}
        legend="What is the bill for?"
        invalid={errors.category !== undefined}
        errorId={describedBy('category')}
      />
      {fieldError('category')}

      <div className="cost-editor__row">
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-vendor`}>
            Who sent it?
          </label>
          <input
            id={`${id}-vendor`}
            className="form-input"
            autoComplete="off"
            maxLength={80}
            placeholder="Iberdrola"
            value={form.vendor}
            onChange={(event) => set('vendor', event.target.value)}
            aria-invalid={errors.vendor !== undefined || undefined}
            aria-describedby={describedBy('vendor')}
          />
          {fieldError('vendor')}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-amount`}>
            Total on the bill
          </label>
          <input
            id={`${id}-amount`}
            className="form-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="96.50"
            value={form.amount}
            onChange={(event) => set('amount', event.target.value)}
            aria-invalid={errors.amount !== undefined || undefined}
            aria-describedby={describedBy('amount')}
          />
          {fieldError('amount')}
        </div>
      </div>

      <div className="cost-editor__row">
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-periodStart`}>
            Covers from
          </label>
          <input
            id={`${id}-periodStart`}
            type="date"
            className="form-input"
            value={form.periodStart}
            onChange={(event) => set('periodStart', event.target.value)}
            aria-invalid={errors.periodStart !== undefined || undefined}
            aria-describedby={describedBy('periodStart')}
          />
          {fieldError('periodStart')}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-periodEnd`}>
            Until
          </label>
          <input
            id={`${id}-periodEnd`}
            type="date"
            className="form-input"
            value={form.periodEnd}
            onChange={(event) => set('periodEnd', event.target.value)}
            aria-invalid={errors.periodEnd !== undefined || undefined}
            aria-describedby={describedBy('periodEnd')}
          />
          {fieldError('periodEnd')}
        </div>
      </div>

      <SegmentedChoice
        name={`${id}-cadence`}
        legend="How often does this bill come?"
        options={BILLING_CADENCE_OPTIONS}
        value={form.cadence}
        onChange={(cadence) => set('cadence', cadence)}
      />

      {errors.form && (
        <p className="form-error-text" role="alert">
          {errors.form}
        </p>
      )}

      <div className="cost-editor__actions">
        <button type="submit" className="btn-primary-apply" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Log bill'}
        </button>
        <button type="button" className="btn-secondary-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
