import { useId, useState, type FormEvent } from 'react';
import type { BillingRecordDto, CreateBillingRecordRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { billFormFrom, emptyBillForm, type BillErrors } from './billForm';
import BillFields from './BillFields';
import { validateReview, type ReviewForm } from './documentForm';
import { describeFailure } from './failureMessage';

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
  const [form, setForm] = useState<ReviewForm>(() => (initial ? billFormFrom(initial) : emptyBillForm(asOf)));
  const [errors, setErrors] = useState<BillErrors>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) => setForm((previous) => ({ ...previous, [key]: value }));
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateReview(form, phaseId, currency);
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
      <BillFields id={id} form={form} set={set} errors={errors} />

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
