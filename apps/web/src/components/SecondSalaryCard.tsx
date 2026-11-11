import { useId, useState, type FormEvent } from 'react';
import type { SecondSalaryResponse } from '../contracts';
import type { MutationResult } from '../lib/apiErrors';
import { keepDecimal } from '../lib/inputFilters';
import { minorToInputString } from '../lib/money';
import { describeSecondSalary } from './describeSecondSalary';
import { describeFailure } from './profile/failureMessage';
import { validateTargetForm } from './secondSalaryTargetForm';

interface SecondSalaryCardProps {
  secondSalary: SecondSalaryResponse;
  /** Sets the monthly amount to aim at; null clears it. */
  onSaveTarget: (monthlyMinor: number | null) => Promise<MutationResult>;
}

/** What the portfolio pays each month, and how close that is to the amount the person chose to aim at. */
export default function SecondSalaryCard({ secondSalary, onSaveTarget }: SecondSalaryCardProps) {
  const id = useId();
  const view = describeSecondSalary(secondSalary);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = () => {
    setTyped(secondSalary.target ? minorToInputString(secondSalary.target.monthlyMinor, secondSalary.currency) : '');
    setError(null);
    setEditing(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validateTargetForm(typed, secondSalary.currency);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBusy(true);
    const saved = await onSaveTarget(result.monthlyMinor);
    setBusy(false);
    if (saved.ok) setEditing(false);
    else setError(describeFailure(saved.failure));
  };

  const form = (
    <form className="second-salary-card__form" onSubmit={submit} noValidate aria-label="Second salary target">
      <div className="form-group">
        <label className="form-label" htmlFor={`${id}-target`}>
          Monthly target ({secondSalary.currency})
        </label>
        <input
          id={`${id}-target`}
          className="form-input"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="2500"
          value={typed}
          onChange={(event) => setTyped(keepDecimal(event.target.value))}
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error && (
          <p className="form-error-text" id={`${id}-error`} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="second-salary-card__actions">
        <button type="button" className="btn-secondary-cancel" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button type="submit" className="btn-primary-apply" disabled={busy}>
          {busy ? 'Saving…' : 'Save target'}
        </button>
      </div>
    </form>
  );

  return (
    <section className="second-salary-card" aria-labelledby={`${id}-title`}>
      <div className="second-salary-card__top">
        <h2 className="second-salary-card__title" id={`${id}-title`}>
          Second Salary
        </h2>
        {view.target && !editing && (
          <button type="button" className="profile-text-button" onClick={open}>
            Edit target
          </button>
        )}
      </div>
      <p className="second-salary-card__explanation">{view.explanation}</p>

      {view.target === null && !editing && (
        <div className="second-salary-card__empty">
          <p className="second-salary-card__income">Your portfolio pays {view.income}</p>
          <button type="button" className="btn-primary-apply" onClick={open}>
            Set your target
          </button>
        </div>
      )}

      {editing && form}

      {view.target && !editing && (
        <>
          <p className="second-salary-card__income">
            <strong>{view.income}</strong> <span className="second-salary-card__of">of {view.target.label}</span>
          </p>
          <div
            className="second-salary-card__track"
            role="progressbar"
            aria-label={view.target.summary}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.floor(view.target.fill * 100)}
          >
            <div className={`second-salary-card__fill${view.target.reached ? ' is-reached' : ''}`} style={{ width: `${view.target.fill * 100}%` }} />
          </div>
          <p className="second-salary-card__note">{view.target.note}</p>
        </>
      )}

      {view.covers && <p className="second-salary-card__covers">{view.covers}</p>}
    </section>
  );
}
