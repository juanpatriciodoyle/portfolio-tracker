import { clampDateYear, keepDecimal } from '../../lib/inputFilters';
import type { BillErrors, BillField, BillForm, BillFormContext } from './billForm';
import { withCadence, withCategory, withPeriod, withVendor } from './billForm';
import CategoryChips from './CategoryChips';
import { BILLING_CADENCE_OPTIONS } from './labels';
import SegmentedChoice from './SegmentedChoice';

interface BillFieldsProps {
  /** Prefix for element ids; keep it unique on the page. */
  id: string;
  form: BillForm;
  /** Changes the form from what it is now, so two quick changes never overwrite each other. */
  update: (change: (form: BillForm) => BillForm) => void;
  context: BillFormContext;
  errors: BillErrors;
  /** Fields a document did not reveal: each is outlined in yellow until it is filled in. */
  blanks?: readonly BillField[];
}

/** The fields of an expense: what it is for, who sent it, what it cost, what it covers and how often it comes. */
export default function BillFields({ id, form, update, context, errors, blanks = [] }: BillFieldsProps) {
  const describedBy = (field: BillField) => (errors[field] ? `${id}-${field}-error` : undefined);
  const fieldError = (field: BillField) =>
    errors[field] && (
      <p className="form-error-text" id={`${id}-${field}-error`} role="alert">
        {errors[field]}
      </p>
    );
  /** A field the document could not read and nobody has filled in yet. */
  const unread = (field: BillField, filled: boolean) => blanks.includes(field) && !filled;
  const inputClass = (field: BillField, filled: boolean) => `form-input${unread(field, filled) ? ' is-unread' : ''}`;

  return (
    <>
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
          onChange={(event) => update((current) => withVendor(current, event.target.value, context))}
          aria-invalid={errors.vendor !== undefined || undefined}
          aria-describedby={describedBy('vendor')}
        />
        {fieldError('vendor')}
      </div>

      <CategoryChips
        name={`${id}-category`}
        value={form.category}
        onChange={(category) => update((current) => withCategory(current, category))}
        legend="What is the bill for?"
        invalid={errors.category !== undefined}
        errorId={describedBy('category')}
        unread={unread('category', form.category !== null)}
      />
      {fieldError('category')}

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
          aria-describedby={describedBy('amount')}
        />
        {fieldError('amount')}
      </div>

      <SegmentedChoice
        name={`${id}-cadence`}
        legend="How often does this bill come?"
        options={BILLING_CADENCE_OPTIONS}
        value={form.cadence}
        onChange={(cadence) => update((current) => withCadence(current, cadence, context))}
        unread={unread('cadence', form.cadence !== null)}
      />
      {fieldError('cadence')}

      <div className="cost-editor__row">
        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-periodStart`}>
            Covers from
          </label>
          <input
            id={`${id}-periodStart`}
            type="date"
            className={inputClass('periodStart', form.periodStart !== '')}
            value={form.periodStart}
            onChange={(event) => update((current) => withPeriod(current, 'periodStart', clampDateYear(event.target.value)))}
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
            className={inputClass('periodEnd', form.periodEnd !== '')}
            value={form.periodEnd}
            onChange={(event) => update((current) => withPeriod(current, 'periodEnd', clampDateYear(event.target.value)))}
            aria-invalid={errors.periodEnd !== undefined || undefined}
            aria-describedby={describedBy('periodEnd')}
          />
          {fieldError('periodEnd')}
        </div>
      </div>
    </>
  );
}
