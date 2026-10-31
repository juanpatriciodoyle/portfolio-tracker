import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { CreateFixedCostRequest, LivingPhaseDto, TimelineEntryDto, UpdateFixedCostRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { countryName, flagEmoji } from '../../lib/countries';
import { formatMinor, formatPercent, formatPhaseRange } from '../../lib/money';
import { barWidthPercent } from '../../lib/scale';
import { describeFailure } from './failureMessage';
import { STATUS_LABELS } from './labels';
import PhaseDetails from './PhaseDetails';

interface LivingPhaseCardProps {
  phase: LivingPhaseDto;
  /** The computed month-by-month picture; absent only for a moment after a change. */
  entry: TimelineEntryDto | undefined;
  expanded: boolean;
  compareSelected: boolean;
  onToggleExpanded: () => void;
  onToggleCompare: () => void;
  onEdit: () => void;
  onDelete: () => Promise<MutationResult<unknown>>;
  onAddCost: (phaseId: string, input: CreateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onUpdateCost: (phaseId: string, costId: string, input: UpdateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onDeleteCost: (phaseId: string, costId: string) => Promise<MutationResult<unknown>>;
  announce: (message: string) => void;
}

/** One home: at a glance what it brings in and costs, and everything else on request. */
export default function LivingPhaseCard({
  phase,
  entry,
  expanded,
  compareSelected,
  onToggleExpanded,
  onToggleCompare,
  onEdit,
  onDelete,
  onAddCost,
  onUpdateCost,
  onDeleteCost,
  announce,
}: LivingPhaseCardProps) {
  const id = useId();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const status = entry?.status;
  const largest = entry ? Math.max(entry.monthlyIncomeMinor, entry.monthlyFixedCostsMinor) : 0;

  const confirmDelete = async () => {
    setDeleting(true);
    const result = await onDelete();
    setDeleting(false);
    if (!result.ok) setDeleteError(describeFailure(result.failure));
  };

  return (
    <article
      className={`phase-card${status ? ` is-${status}` : ''}${expanded ? ' is-expanded' : ''}${compareSelected ? ' is-compared' : ''}`}
      aria-labelledby={`${id}-title`}
    >
      <header className="phase-card__header">
        <h3 className="phase-card__title" id={`${id}-title`}>
          <button
            type="button"
            className="phase-card__toggle"
            aria-expanded={expanded}
            aria-controls={`${id}-details`}
            onClick={onToggleExpanded}
          >
            <span>{phase.name}</span>
            <ChevronDown className="phase-card__chevron" size={16} aria-hidden="true" />
          </button>
        </h3>
        {status && <span className={`phase-status phase-status--${status}`}>{STATUS_LABELS[status]}</span>}
        <button
          type="button"
          className={`profile-toggle-button${compareSelected ? ' is-on' : ''}`}
          aria-pressed={compareSelected}
          onClick={onToggleCompare}
        >
          Compare
        </button>
      </header>

      <p className="phase-card__meta">
        {flagEmoji(phase.countryCode)} {phase.city}, {countryName(phase.countryCode)} ·{' '}
        {formatPhaseRange(phase.startDate, phase.endDate, undefined, status === 'upcoming' ? 'open' : 'now')}
      </p>

      {entry && (
        <div className="phase-card__metrics">
          <p className="phase-card__caption">Per month</p>
          <div className="phase-bar-row">
            <span className="phase-bar-row__label">Income</span>
            <span className="phase-bar" aria-hidden="true">
              <span
                className="phase-bar__fill phase-bar__fill--income"
                style={{ width: `${barWidthPercent(entry.monthlyIncomeMinor, largest)}%` }}
              />
            </span>
            <span className="phase-bar-row__value">{formatMinor(entry.monthlyIncomeMinor, entry.currency)}</span>
          </div>
          <div className="phase-bar-row">
            <span className="phase-bar-row__label">Fixed costs</span>
            <span className="phase-bar" aria-hidden="true">
              <span
                className="phase-bar__fill phase-bar__fill--costs"
                style={{ width: `${barWidthPercent(entry.monthlyFixedCostsMinor, largest)}%` }}
              />
            </span>
            <span className="phase-bar-row__value">{formatMinor(entry.monthlyFixedCostsMinor, entry.currency)}</span>
          </div>
          <p className={`phase-card__leftover ${entry.savingsCapacityMinor >= 0 ? 'is-positive' : 'is-negative'}`}>
            <strong>{formatMinor(Math.abs(entry.savingsCapacityMinor), entry.currency)}</strong>{' '}
            {entry.savingsCapacityMinor >= 0 ? 'left each month' : 'short each month'}
            {entry.savingsRate !== null && <span className="phase-card__rate"> · {formatPercent(entry.savingsRate)} of income</span>}
          </p>
        </div>
      )}

      <div id={`${id}-details`} className="phase-card__details" aria-hidden={!expanded} inert={!expanded}>
        <div className="phase-card__details-inner">
          <PhaseDetails
            phase={phase}
            entry={entry}
            onAddCost={onAddCost}
            onUpdateCost={onUpdateCost}
            onDeleteCost={onDeleteCost}
            announce={announce}
          />

          <div className="phase-card__footer">
            {confirmingDelete ? (
              <div className="confirm-inline" role="group" aria-label={`Confirm deleting ${phase.name}`}>
                <span>Delete {phase.name} and its costs?</span>
                <button type="button" className="profile-danger-button" onClick={confirmDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button type="button" className="profile-text-button" onClick={() => setConfirmingDelete(false)}>
                  Keep
                </button>
              </div>
            ) : (
              <>
                <button type="button" className="profile-text-button" onClick={onEdit}>
                  <Pencil size={14} aria-hidden="true" /> Edit phase
                </button>
                <button
                  type="button"
                  className="profile-text-button profile-text-button--danger"
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmingDelete(true);
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" /> Delete phase
                </button>
              </>
            )}
          </div>
          {deleteError && (
            <p className="form-error-text" role="alert">
              {deleteError}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
