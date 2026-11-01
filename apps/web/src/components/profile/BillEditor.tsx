import { useId, useState, type FormEvent } from 'react';
import type { BillingRecordDto, CreateBillingRecordRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { billFormFrom, emptyBillForm, validateBill, type BillErrors, type BillForm, type BillFormContext } from './billForm';
import BillFields from './BillFields';
import { describeFailure } from './failureMessage';

interface BillEditorProps {
  phaseId: string;
  currency: string;
  /** Today, the home's country and the senders the person already has: what the form needs to suggest and to fill in days. */
  context: BillFormContext;
  /** Present when changing a bill that was already logged. */
  initial?: BillingRecordDto;
  onSubmit: (input: CreateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  onCancel: () => void;
}

/** Add, or correct, one expense that actually arrived: who sent it, what it cost, and what it covers. */
export default function BillEditor({ phaseId, currency, context, initial, onSubmit, onCancel }: BillEditorProps) {
  const id = useId();
  const [form, setForm] = useState<BillForm>(() => (initial ? billFormFrom(initial) : emptyBillForm()));
  const [errors, setErrors] = useState<BillErrors>({});
  const [saving, setSaving] = useState(false);

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
    <form className="cost-editor bill-editor" onSubmit={handleSubmit} noValidate aria-label={initial ? 'Edit bill' : 'Add an expense'}>
      <BillFields id={id} form={form} update={(change) => setForm(change)} context={context} errors={errors} />

      {errors.form && (
        <p className="form-error-text" role="alert">
          {errors.form}
        </p>
      )}

      <div className="cost-editor__actions">
        <button type="submit" className="btn-primary-apply" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add expense'}
        </button>
        <button type="button" className="btn-secondary-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
