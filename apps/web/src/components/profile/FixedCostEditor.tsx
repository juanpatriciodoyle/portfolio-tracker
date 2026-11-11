import { useId, useState, type FormEvent } from 'react';
import {
  createFixedCostRequest,
  type CostCadence,
  type CreateFixedCostRequest,
  type FixedCostCategory,
  type FixedCostDto,
} from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { clampDateYear, keepDecimal } from '../../lib/inputFilters';
import { minorToInputString, parseMajorToMinor } from '../../lib/money';
import CategoryChips from './CategoryChips';
import { describeFailure } from './failureMessage';
import { CADENCE_OPTIONS } from './labels';
import SegmentedChoice from './SegmentedChoice';

interface FixedCostEditorProps {
  currency: string;
  /** Present when editing an existing cost. */
  initial?: FixedCostDto;
  onSubmit: (input: CreateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onCancel: () => void;
}

interface Errors {
  category?: string;
  amount?: string;
  label?: string;
  form?: string;
}

/** Add or change one bill: what it is, what each payment costs, and how often it is paid. */
export default function FixedCostEditor({ currency, initial, onSubmit, onCancel }: FixedCostEditorProps) {
  const id = useId();
  const [category, setCategory] = useState<FixedCostCategory | null>(initial?.category ?? null);
  const [cadence, setCadence] = useState<CostCadence>(initial?.cadence ?? 'MONTHLY');
  const [amount, setAmount] = useState(initial ? minorToInputString(initial.amountMinor, currency) : '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: Errors = {};
    const amountMinor = parseMajorToMinor(amount, currency);
    if (category === null) found.category = 'Pick what this bill is for.';
    if (amountMinor === null) found.amount = 'Enter an amount such as 48 or 48.50.';
    if (category === null || amountMinor === null) {
      setErrors(found);
      return;
    }

    const parsed = createFixedCostRequest.safeParse({
      category,
      cadence,
      amountMinor,
      label: label.trim() === '' ? null : label,
      // Only a changed end date is sent: emptying the date of an ended cost brings it back.
      ...(endDate !== (initial?.endDate ?? '') ? { endDate: endDate === '' ? null : endDate } : {}),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'label') found.label = 'Keep the label under 80 characters.';
        else found.amount = 'That amount is too large.';
      }
      setErrors(found);
      return;
    }

    setErrors({});
    setSaving(true);
    const result = await onSubmit(parsed.data);
    setSaving(false);
    if (!result.ok) setErrors({ form: describeFailure(result.failure) });
  };

  return (
    <form
      className="cost-editor"
      onSubmit={handleSubmit}
      noValidate
      aria-label={initial ? 'Edit fixed cost' : 'Add a fixed cost'}
    >
      <CategoryChips
        name={`${id}-category`}
        value={category}
        onChange={(chosen) => {
          setCategory(chosen);
        }}
        invalid={errors.category !== undefined}
        errorId={errors.category ? `${id}-category-error` : undefined}
      />
      {errors.category && (
        <p className="form-error-text" id={`${id}-category-error`} role="alert">
          {errors.category}
        </p>
      )}

      <div className="cost-editor__row">
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-amount`}>
            Amount each time
          </label>
          <input
            id={`${id}-amount`}
            className="form-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="48.50"
            value={amount}
            onChange={(event) => setAmount(keepDecimal(event.target.value))}
            aria-invalid={errors.amount !== undefined || undefined}
            aria-describedby={errors.amount ? `${id}-amount-error` : undefined}
          />
          {errors.amount && (
            <p className="form-error-text" id={`${id}-amount-error`} role="alert">
              {errors.amount}
            </p>
          )}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-label`}>
            Label (optional)
          </label>
          <input
            id={`${id}-label`}
            className="form-input"
            autoComplete="off"
            placeholder="Company / Provider"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            aria-invalid={errors.label !== undefined || undefined}
            aria-describedby={errors.label ? `${id}-label-error` : undefined}
          />
          {errors.label && (
            <p className="form-error-text" id={`${id}-label-error`} role="alert">
              {errors.label}
            </p>
          )}
        </div>
      </div>

      <SegmentedChoice
        name={`${id}-cadence`}
        legend="How often is it paid?"
        options={CADENCE_OPTIONS}
        value={cadence}
        onChange={(chosen) => {
          setCadence(chosen);
        }}
      />

      <div className="form-group">
        <label className="form-label" htmlFor={`${id}-endDate`}>
          Ends on (optional)
        </label>
        <input
          id={`${id}-endDate`}
          type="date"
          className="form-input"
          value={endDate}
          onChange={(event) => setEndDate(clampDateYear(event.target.value))}
        />
      </div>

      {errors.form && (
        <p className="form-error-text" role="alert">
          {errors.form}
        </p>
      )}

      <div className="cost-editor__actions">
        <button type="submit" className="btn-primary-apply" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add cost'}
        </button>
        <button type="button" className="btn-secondary-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
