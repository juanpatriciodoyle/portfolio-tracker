import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { IncomeStreamDto, LivingPhaseDto, UpdateLivingPhaseRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { formatMinor } from '../../lib/money';
import { describeFailure } from './failureMessage';
import IncomeStreamEditor from './IncomeStreamEditor';
import { describeIncomeStream } from './incomeForm';

interface IncomeSectionProps {
  phase: LivingPhaseDto;
  onUpdatePhase: (phaseId: string, input: UpdateLivingPhaseRequest) => Promise<MutationResult<unknown>>;
  announce: (message: string) => void;
}

type Editing = { mode: 'add' } | { mode: 'edit'; index: number } | null;

const byStart = (a: IncomeStreamDto, b: IncomeStreamDto) =>
  a.startDate.localeCompare(b.startDate) || (a.endDate ?? '').localeCompare(b.endDate ?? '') || a.label.localeCompare(b.label);

/** Every source of income during a home: jobs may overlap, and a stretch with none is simply a gap. */
export default function IncomeSection({ phase, onUpdatePhase, announce }: IncomeSectionProps) {
  const id = useId();
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const streams = [...phase.incomeStreams].sort(byStart);

  const save = async (next: readonly IncomeStreamDto[], message: string) => {
    const result = await onUpdatePhase(phase.id, { incomeStreams: [...next].sort(byStart) });
    if (result.ok) {
      setEditing(null);
      setConfirmingIndex(null);
      setRemoveError(null);
      announce(message);
    }
    return result;
  };

  const submit = (stream: IncomeStreamDto) =>
    editing?.mode === 'edit'
      ? save(
          streams.map((existing, index) => (index === editing.index ? stream : existing)),
          'Income updated'
        )
      : save([...streams, stream], 'Income added');

  const remove = async (index: number) => {
    const result = await save(
      streams.filter((_, position) => position !== index),
      'Income removed'
    );
    if (!result.ok) setRemoveError(describeFailure(result.failure));
  };

  return (
    <section aria-labelledby={`${id}-income`}>
      <div className="phase-details__heading-row">
        <h4 className="phase-details__heading" id={`${id}-income`}>
          Income
        </h4>
        {editing === null && (
          <button type="button" className="profile-text-button" onClick={() => setEditing({ mode: 'add' })}>
            <Plus size={14} aria-hidden="true" /> Add income
          </button>
        )}
      </div>

      {streams.length > 0 && (
        <ul className="cost-list" aria-label="Income">
          {streams.map((stream, index) => {
            const when = describeIncomeStream(stream);
            const name = `${stream.label} ${when}`;
            return (
              <li key={`${stream.startDate}-${stream.label}-${index}`} className="cost-row income-row">
                {editing?.mode === 'edit' && editing.index === index ? (
                  <IncomeStreamEditor phase={phase} initial={stream} onSubmit={submit} onCancel={() => setEditing(null)} />
                ) : (
                  <>
                    <div className="cost-row__main">
                      <span className="bill-row__text">
                        <span className="cost-row__name">{stream.label}</span>
                        <span className="bill-row__period">{when}</span>
                      </span>
                    </div>
                    <span className="cost-row__amount">
                      {formatMinor(stream.amountMinor, phase.currency)} <span className="cost-row__cadence">every month</span>
                    </span>
                    {confirmingIndex === index ? (
                      <div className="confirm-inline" role="group" aria-label={`Confirm removing ${name}`}>
                        <span>Remove this income?</span>
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

      {editing?.mode === 'add' && <IncomeStreamEditor phase={phase} onSubmit={submit} onCancel={() => setEditing(null)} />}

      {removeError && (
        <p className="form-error-text" role="alert">
          {removeError}
        </p>
      )}
    </section>
  );
}
