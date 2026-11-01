import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { IncomeChangeDto, LivingPhaseDto, UpdateLivingPhaseRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { formatMinor } from '../../lib/money';
import { describeFailure } from './failureMessage';
import IncomeChangeEditor from './IncomeChangeEditor';
import { describeIncomeChange } from './incomeForm';

interface IncomeSectionProps {
  phase: LivingPhaseDto;
  onUpdatePhase: (phaseId: string, input: UpdateLivingPhaseRequest) => Promise<MutationResult<unknown>>;
  announce: (message: string) => void;
}

type Editing = { mode: 'add' } | { mode: 'edit'; index: number } | null;

const byStart = (a: IncomeChangeDto, b: IncomeChangeDto) => a.startDate.localeCompare(b.startDate) || (a.endDate ?? '').localeCompare(b.endDate ?? '');

/** What came in during a home, and when it changed: a raise, a new job, a stretch without work. */
export default function IncomeSection({ phase, onUpdatePhase, announce }: IncomeSectionProps) {
  const id = useId();
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const changes = [...phase.incomeChanges].sort(byStart);

  const save = async (next: readonly IncomeChangeDto[], message: string) => {
    const result = await onUpdatePhase(phase.id, { incomeChanges: [...next].sort(byStart) });
    if (result.ok) {
      setEditing(null);
      setConfirmingIndex(null);
      setRemoveError(null);
      announce(message);
    }
    return result;
  };

  const submit = (change: IncomeChangeDto) =>
    editing?.mode === 'edit'
      ? save(
          changes.map((existing, index) => (index === editing.index ? change : existing)),
          'Income change updated'
        )
      : save([...changes, change], 'Income change added');

  const remove = async (index: number) => {
    const result = await save(
      changes.filter((_, position) => position !== index),
      'Income change removed'
    );
    if (!result.ok) setRemoveError(describeFailure(result.failure));
  };

  return (
    <section aria-labelledby={`${id}-income`}>
      <div className="phase-details__heading-row">
        <h4 className="phase-details__heading" id={`${id}-income`}>
          Income over time
        </h4>
        {editing === null && (
          <button type="button" className="profile-text-button" onClick={() => setEditing({ mode: 'add' })}>
            <Plus size={14} aria-hidden="true" /> Add an income change
          </button>
        )}
      </div>

      {changes.length === 0 && editing === null && (
        <p className="phase-details__hint">
          {formatMinor(phase.monthlyIncomeMinor, phase.currency)} a month. Did it change here? Add a raise, a new job or a stretch without work.
        </p>
      )}

      {changes.length > 0 && (
        <ul className="cost-list" aria-label="Income over time">
          <li className="cost-row income-row">
            <div className="cost-row__main">
              <span className="cost-row__name">Starting income</span>
            </div>
            <span className="cost-row__amount">
              {formatMinor(phase.monthlyIncomeMinor, phase.currency)} <span className="cost-row__cadence">every month</span>
            </span>
          </li>
          {changes.map((change, index) => {
            const { when, reason } = describeIncomeChange(change);
            const name = `income change ${when}`;
            return (
              <li key={`${change.startDate}-${index}`} className="cost-row income-row">
                {editing?.mode === 'edit' && editing.index === index ? (
                  <IncomeChangeEditor phase={phase} initial={change} onSubmit={submit} onCancel={() => setEditing(null)} />
                ) : (
                  <>
                    <div className="cost-row__main">
                      <span className="bill-row__text">
                        <span className="cost-row__name">{when}</span>
                        {reason && <span className="bill-row__period">{reason}</span>}
                      </span>
                    </div>
                    <span className="cost-row__amount">
                      {formatMinor(change.amountMinor, phase.currency)} <span className="cost-row__cadence">every month</span>
                    </span>
                    {confirmingIndex === index ? (
                      <div className="confirm-inline" role="group" aria-label={`Confirm removing ${name}`}>
                        <span>Remove this change?</span>
                        <button type="button" className="profile-danger-button" onClick={() => remove(index)}>
                          Remove
                        </button>
                        <button type="button" className="profile-text-button" onClick={() => setConfirmingIndex(null)}>
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div className="cost-row__actions">
                        <button
                          type="button"
                          className="profile-icon-button"
                          aria-label={`Edit ${name}`}
                          onClick={() => {
                            setEditing({ mode: 'edit', index });
                            setConfirmingIndex(null);
                          }}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button type="button" className="profile-icon-button" aria-label={`Remove ${name}`} onClick={() => setConfirmingIndex(index)}>
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing?.mode === 'add' && <IncomeChangeEditor phase={phase} onSubmit={submit} onCancel={() => setEditing(null)} />}

      {removeError && (
        <p className="form-error-text" role="alert">
          {removeError}
        </p>
      )}
    </section>
  );
}
