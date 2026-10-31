import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { HOUSING_TENURES, type LivingPhaseDto } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { currencyOptions } from '../../lib/currencies';
import SideDrawer from '../SideDrawer';
import CountrySelect from './CountrySelect';
import { describeFailure, issuesByField } from './failureMessage';
import { TENURE_LABELS } from './labels';
import {
  initialPhaseForm,
  validatePhaseForm,
  type PhaseFieldErrors,
  type PhaseFormState,
  type PhasePayload,
} from './phaseForm';

interface PhaseEditorDrawerProps {
  isOpen: boolean;
  /** The phase being edited, or null to add a new one. */
  phase: LivingPhaseDto | null;
  /** Every phase, so an overlap can be explained by name. */
  phases: readonly LivingPhaseDto[];
  hasCurrentPhase: boolean;
  /** Pre-selected currency for a new phase. */
  defaultCurrency: string;
  onClose: () => void;
  onSubmit: (payload: PhasePayload) => Promise<MutationResult<unknown>>;
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="phase-editor__hint">{hint}</p>}
      {error && (
        <p className="form-error-text" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The server's field names, mapped onto the form's. */
const toFormField = (field: string) => (field === 'monthlyIncomeMinor' ? 'monthlyIncome' : field);

function PhaseEditorForm({
  phase,
  phases,
  hasCurrentPhase,
  defaultCurrency,
  onClose,
  onSubmit,
}: Omit<PhaseEditorDrawerProps, 'isOpen'>) {
  const id = useId();
  const [form, setForm] = useState<PhaseFormState>(() =>
    initialPhaseForm(phase, { currency: defaultCurrency, stillLivingHere: !hasCurrentPhase })
  );
  const [errors, setErrors] = useState<PhaseFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const currencies = useMemo(() => currencyOptions(), []);

  const set = <K extends keyof PhaseFormState>(key: K, value: PhaseFormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const errorOf = (field: keyof PhaseFormState) => errors[field];
  const describedBy = (field: keyof PhaseFormState) => (errors[field] ? `${id}-${field}-error` : undefined);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validatePhaseForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(null);
      return;
    }

    setErrors({});
    setFormError(null);
    setSaving(true);
    const outcome = await onSubmit(result.payload);
    setSaving(false);
    if (outcome.ok) return;

    const fromServer: PhaseFieldErrors = {};
    for (const [field, message] of Object.entries(issuesByField(outcome.failure))) {
      const formField = toFormField(field);
      if (formField in form) fromServer[formField as keyof PhaseFormState] = message;
    }
    if (Object.keys(fromServer).length > 0) setErrors(fromServer);
    else setFormError(describeFailure(outcome.failure, phases));
  };

  return (
    <form
      className="phase-editor"
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <h2 className="phase-editor__title" id={`${id}-title`}>
        {phase ? 'Edit living phase' : 'Add a living phase'}
      </h2>
      <p className="phase-editor__intro">A home you lived in, live in, or plan to live in.</p>

      <Field id={`${id}-name`} label="Name" error={errorOf('name')}>
        <input
          id={`${id}-name`}
          className="form-input"
          autoFocus
          autoComplete="off"
          maxLength={80}
          placeholder="Madrid flat"
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
          aria-invalid={errorOf('name') !== undefined || undefined}
          aria-describedby={describedBy('name')}
        />
      </Field>

      <div className="phase-editor__row">
        <Field id={`${id}-city`} label="City" error={errorOf('city')}>
          <input
            id={`${id}-city`}
            className="form-input"
            autoComplete="off"
            maxLength={80}
            value={form.city}
            onChange={(event) => set('city', event.target.value)}
            aria-invalid={errorOf('city') !== undefined || undefined}
            aria-describedby={describedBy('city')}
          />
        </Field>
        <Field id={`${id}-countryCode`} label="Country" error={errorOf('countryCode')}>
          <CountrySelect
            id={`${id}-countryCode`}
            value={form.countryCode}
            onChange={(code) => set('countryCode', code)}
            placeholder="Choose a country"
            invalid={errorOf('countryCode') !== undefined}
            describedBy={describedBy('countryCode')}
          />
        </Field>
      </div>

      <div className="phase-editor__row">
        <Field id={`${id}-startDate`} label="Moved in" error={errorOf('startDate')}>
          <input
            id={`${id}-startDate`}
            type="date"
            className="form-input"
            value={form.startDate}
            onChange={(event) => set('startDate', event.target.value)}
            aria-invalid={errorOf('startDate') !== undefined || undefined}
            aria-describedby={describedBy('startDate')}
          />
        </Field>
        <Field id={`${id}-endDate`} label="Moved out" error={errorOf('endDate')}>
          <input
            id={`${id}-endDate`}
            type="date"
            className="form-input"
            value={form.endDate}
            disabled={form.stillLivingHere}
            onChange={(event) => set('endDate', event.target.value)}
            aria-invalid={errorOf('endDate') !== undefined || undefined}
            aria-describedby={describedBy('endDate')}
          />
        </Field>
      </div>
      <label className="profile-check">
        <input
          type="checkbox"
          checked={form.stillLivingHere}
          onChange={(event) => set('stillLivingHere', event.target.checked)}
        />
        Still living here
      </label>

      <div className="phase-editor__row">
        <Field id={`${id}-currency`} label="Currency" error={errorOf('currency')}>
          <select
            id={`${id}-currency`}
            className="form-input"
            value={form.currency}
            onChange={(event) => set('currency', event.target.value)}
          >
            {currencies.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-tenure`} label="Housing" error={errorOf('tenure')}>
          <select
            id={`${id}-tenure`}
            className="form-input"
            value={form.tenure}
            onChange={(event) => set('tenure', event.target.value as PhaseFormState['tenure'])}
          >
            {HOUSING_TENURES.map((tenure) => (
              <option key={tenure} value={tenure}>
                {TENURE_LABELS[tenure]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        id={`${id}-monthlyIncome`}
        label="Monthly net income"
        hint="What lands in your account each month, in the currency above."
        error={errorOf('monthlyIncome')}
      >
        <input
          id={`${id}-monthlyIncome`}
          className="form-input"
          inputMode="decimal"
          autoComplete="off"
          placeholder="3,200"
          value={form.monthlyIncome}
          onChange={(event) => set('monthlyIncome', event.target.value)}
          aria-invalid={errorOf('monthlyIncome') !== undefined || undefined}
          aria-describedby={describedBy('monthlyIncome')}
        />
      </Field>

      <Field id={`${id}-address`} label="Address (optional)" error={errorOf('address')}>
        <input
          id={`${id}-address`}
          className="form-input"
          autoComplete="off"
          maxLength={200}
          value={form.address}
          onChange={(event) => set('address', event.target.value)}
        />
      </Field>
      <Field id={`${id}-notes`} label="Notes (optional)" error={errorOf('notes')}>
        <textarea
          id={`${id}-notes`}
          className="form-input phase-editor__notes"
          rows={3}
          maxLength={500}
          value={form.notes}
          onChange={(event) => set('notes', event.target.value)}
        />
      </Field>

      {formError && (
        <p className="form-error-text" role="alert">
          {formError}
        </p>
      )}

      <div className="phase-editor__actions">
        <button type="submit" className="btn-primary-apply" disabled={saving}>
          {saving ? 'Saving…' : phase ? 'Save changes' : 'Add living phase'}
        </button>
        <button type="button" className="btn-secondary-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Add or change a living phase in the same side drawer used for logging transactions. */
export default function PhaseEditorDrawer({ isOpen, ...rest }: PhaseEditorDrawerProps) {
  return (
    <SideDrawer isOpen={isOpen} onClose={rest.onClose}>
      <PhaseEditorForm key={rest.phase?.id ?? 'new'} {...rest} />
    </SideDrawer>
  );
}
