import { useId, useState, type FormEvent } from 'react';
import { CAPITAL_MILESTONE_CATEGORIES, type CapitalMilestone } from '../contracts';
import type { MutationResult } from '../lib/apiErrors';
import { describeFailure } from './profile/failureMessage';
import Modal from './Modal';
import { CATEGORY_LABELS, validateMilestoneForm, withCategory, type MilestoneErrors, type MilestoneForm } from './capitalMilestoneForm';

interface CapitalMilestoneEditorProps {
  initial: MilestoneForm;
  /** The id the milestone is saved under: its own when editing, a new one otherwise. */
  id: string;
  currency: string;
  /** Only when changing a milestone that already exists. */
  onDelete?: () => Promise<MutationResult>;
  onSave: (milestone: CapitalMilestone) => Promise<MutationResult>;
  onClose: () => void;
}

/** Set up, adjust or remove a goal: its name, its target and how much of the target must be held as capital. */
export default function CapitalMilestoneEditor({ initial, id, currency, onDelete, onSave, onClose }: CapitalMilestoneEditorProps) {
  const fieldId = useId();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<MilestoneErrors & { form?: string }>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const finish = async (action: () => Promise<MutationResult>) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (result.ok) onClose();
    else setErrors({ form: describeFailure(result.failure) });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateMilestoneForm(form, currency, id);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    void finish(() => onSave(result.milestone));
  };

  const set = (field: 'title' | 'amount' | 'percentage') => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const describedBy = (field: keyof MilestoneErrors) => (errors[field] ? `${fieldId}-${field}-error` : undefined);
  const fieldError = (field: keyof MilestoneErrors) =>
    errors[field] && (
      <p className="form-error-text" id={`${fieldId}-${field}-error`} role="alert">
        {errors[field]}
      </p>
    );

  return (
    <Modal label={onDelete ? 'Edit milestone' : 'Set a milestone target'} onClose={onClose}>
      <h2 className="dialog__title">{onDelete ? 'Edit milestone' : 'Set a milestone target'}</h2>
      <p className="dialog__hint">Pick a goal and how much capital it asks for. The date is worked out from what your life leaves over each month.</p>

      <form className="cost-editor" onSubmit={handleSubmit} noValidate aria-label="Milestone">
        <fieldset className="profile-segmented">
          <legend className="form-label">Kind of goal</legend>
          <div className="income-reasons">
            {CAPITAL_MILESTONE_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={`profile-toggle-button${form.category === category ? ' is-on' : ''}`}
                aria-pressed={form.category === category}
                onClick={() => setForm((current) => withCategory(current, category))}
              >
                {CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="form-group">
          <label className="form-label" htmlFor={`${fieldId}-title`}>
            Name
          </label>
          <input
            id={`${fieldId}-title`}
            className="form-input"
            autoComplete="off"
            value={form.title}
            onChange={set('title')}
            aria-invalid={errors.title !== undefined || undefined}
            aria-describedby={describedBy('title')}
          />
          {fieldError('title')}
        </div>

        <div className="cost-editor__row">
          <div className="form-group">
            <label className="form-label" htmlFor={`${fieldId}-amount`}>
              Target amount
            </label>
            <input
              id={`${fieldId}-amount`}
              className="form-input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="350000"
              value={form.amount}
              onChange={set('amount')}
              aria-invalid={errors.amount !== undefined || undefined}
              aria-describedby={describedBy('amount')}
            />
            {fieldError('amount')}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`${fieldId}-percentage`}>
              Capital required (%)
            </label>
            <input
              id={`${fieldId}-percentage`}
              className="form-input"
              inputMode="numeric"
              autoComplete="off"
              value={form.percentage}
              onChange={set('percentage')}
              aria-invalid={errors.percentage !== undefined || undefined}
              aria-describedby={describedBy('percentage')}
            />
            {fieldError('percentage')}
          </div>
        </div>

        {errors.form && (
          <p className="form-error-text" role="alert">
            {errors.form}
          </p>
        )}

        <div className="cost-editor__actions">
          <button type="submit" className="btn-primary-apply" disabled={busy}>
            {busy ? 'Saving…' : 'Save milestone'}
          </button>
          <button type="button" className="btn-secondary-cancel" onClick={onClose}>
            Cancel
          </button>
          {onDelete && !confirmingDelete && (
            <button type="button" className="profile-text-button profile-text-button--danger" onClick={() => setConfirmingDelete(true)}>
              Delete milestone
            </button>
          )}
        </div>

        {onDelete && confirmingDelete && (
          <div className="capital-horizon__confirm" role="group" aria-label="Confirm delete">
            <span>Delete this milestone?</span>
            <button type="button" className="profile-text-button profile-text-button--danger" disabled={busy} onClick={() => void finish(onDelete)}>
              Yes, delete it
            </button>
            <button type="button" className="profile-text-button" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
