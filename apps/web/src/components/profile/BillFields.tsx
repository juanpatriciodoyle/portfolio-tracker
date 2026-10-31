import type { ReactNode } from 'react';
import type { BillingCadence } from '../../contracts';
import type { BillField, BillForm } from './billForm';
import CategoryChips from './CategoryChips';
import type { ReviewErrors, ReviewField } from './documentForm';
import { BILLING_CADENCE_OPTIONS } from './labels';
import SegmentedChoice from './SegmentedChoice';

/** What the shared fields edit: a bill form whose cadence may still be unpicked. */
export type BillFieldsValue = Omit<BillForm, 'cadence'> & { cadence: BillingCadence | null };

interface BillFieldsProps {
  /** Prefix for element ids; keep it unique on the page. */
  id: string;
  form: BillFieldsValue;
  set: <K extends keyof BillFieldsValue>(key: K, value: BillFieldsValue[K]) => void;
  errors: ReviewErrors;
  /** Fields a document did not reveal: each is flagged until it is filled in. */
  blanks?: readonly ReviewField[];
}

export const UNREAD_FIELD_NOTE = "We couldn't read this, please fill it in";

/** The fields of a bill: what it is for, who sent it, what it cost, what it covers and how often it comes. */
export default function BillFields({ id, form, set, errors, blanks = [] }: BillFieldsProps) {
  const describedBy = (field: BillField | 'cadence') => (errors[field] ? `${id}-${field}-error` : undefined);
  const fieldError = (field: BillField | 'cadence') =>
    errors[field] && (
      <p className="form-error-text" id={`${id}-${field}-error`} role="alert">
        {errors[field]}
      </p>
    );
  const unread = (field: ReviewField, filled: boolean): ReactNode =>
    blanks.includes(field) && !filled && <p className="form-unread-note">{UNREAD_FIELD_NOTE}</p>;

  return (
    <>
      <CategoryChips
        name={`${id}-category`}
        value={form.category}
        onChange={(category) => set('category', category)}
        legend="What is the bill for?"
        invalid={errors.category !== undefined}
        errorId={describedBy('category')}
      />
      {fieldError('category')}
      {unread('category', form.category !== null)}

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
          {unread('vendor', form.vendor.trim() !== '')}
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
          {unread('amount', form.amount.trim() !== '')}
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
          {unread('periodStart', form.periodStart !== '')}
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
          {unread('periodEnd', form.periodEnd !== '')}
        </div>
      </div>

      <SegmentedChoice
        name={`${id}-cadence`}
        legend="How often does this bill come?"
        options={BILLING_CADENCE_OPTIONS}
        value={form.cadence}
        onChange={(cadence) => set('cadence', cadence)}
      />
      {fieldError('cadence')}
      {unread('cadence', form.cadence !== null)}
    </>
  );
}
