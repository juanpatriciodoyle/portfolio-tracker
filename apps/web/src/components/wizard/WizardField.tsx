import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

interface WizardFieldProps {
  /** The id of the control inside, so the label and the error are tied to it. */
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Show a checkmark: what has been entered passes. */
  valid?: boolean;
  children: ReactNode;
}

/** A labelled control that confirms with a small checkmark once its answer passes. */
export default function WizardField({ id, label, hint, error, valid = false, children }: WizardFieldProps) {
  return (
    <div className="form-group wizard-field">
      <div className="wizard-field__top">
        <label className="form-label" htmlFor={id}>
          {label}
        </label>
        {valid && !error && <Check className="wizard-field__check" size={14} strokeWidth={3} aria-hidden="true" />}
      </div>
      {children}
      {hint && !error && <p className="wizard-field__hint">{hint}</p>}
      {error && (
        <p className="form-error-text" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
