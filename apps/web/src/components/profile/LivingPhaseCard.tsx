import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { LivingPhaseDto, TimelineEntryDto, UpdateFixedCostRequest, UpdateLivingPhaseRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { formatCalendarDate, formatMinor, formatPercent, formatPhaseRange } from '../../lib/money';
import { phaseAddress } from '../../lib/phaseName';
import { barWidthPercent } from '../../lib/scale';
import type { BillingView } from './billingView';
import { describeFailure } from './failureMessage';
import { STATUS_LABELS } from './labels';
import IncomeSection from './IncomeSection';
import { summarizeActiveIncome } from './incomeSummary';
import PhaseDetails from './PhaseDetails';
import IncomeViewToggle from './IncomeViewToggle';
import { burnRateMinor, housingBurden, incomeFigures, type IncomeView } from './phaseRatios';

interface LivingPhaseCardProps {
  phase: LivingPhaseDto;
  /** The computed month-by-month picture; absent only for a moment after a change. */
  entry: TimelineEntryDto | undefined;
  expanded: boolean;
  compareSelected: boolean;
  onToggleExpanded: () => void;
  /** Present only when there is another home to compare with. */
  onToggleCompare?: () => void;
  onEdit: () => void;
  onDelete: () => Promise<MutationResult<unknown>>;
  onUpdatePhase: (phaseId: string, input: UpdateLivingPhaseRequest) => Promise<MutationResult<unknown>>;
  onUpdateCost: (phaseId: string, costId: string, input: UpdateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onDeleteCost: (phaseId: string, costId: string) => Promise<MutationResult<unknown>>;
  billing?: BillingView;
  announce: (message: string) => void;
}

/** One home: at a glance what is left each month and the shares behind it, and every raw figure on request. */
export default function LivingPhaseCard({
  phase,
  entry,
  expanded,
  compareSelected,
  onToggleExpanded,
  onToggleCompare,
  onEdit,
  onDelete,
  onUpdatePhase,
  onUpdateCost,
  onDeleteCost,
  billing,
  announce,
}: LivingPhaseCardProps) {
  const id = useId();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [incomeView, setIncomeView] = useState<IncomeView>('current');
  const [incomeOpen, setIncomeOpen] = useState(false);

  const status = entry?.status;
  const address = phaseAddress(phase);
  const figures = entry ? incomeFigures(entry, incomeView) : null;
  const housing = entry && figures ? housingBurden({ monthlyIncomeMinor: figures.incomeMinor, fixedCostsByCategoryMinor: entry.fixedCostsByCategoryMinor }) : null;
  const savingsRate = figures?.savingsRate ?? null;
  const burn = figures ? burnRateMinor(figures) : null;
  // The income that counts is the one paying on today; a past home shows its last day, one still ahead its first.
  const today = billing?.asOf ?? phase.endDate ?? phase.startDate;
  const incomeDay = phase.endDate !== null && phase.endDate < today ? phase.endDate : today < phase.startDate ? phase.startDate : today;
  const incomeSummary = summarizeActiveIncome(phase.incomeStreams, incomeDay, (amountMinor) => formatMinor(amountMinor, phase.currency), (day) => formatCalendarDate(day));

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
        {onToggleCompare && (
          <button
            type="button"
            className={`profile-toggle-button${compareSelected ? ' is-on' : ''}`}
            aria-pressed={compareSelected}
            onClick={onToggleCompare}
          >
            Compare
          </button>
        )}
      </header>

      {address && <p className="phase-card__address">{address}</p>}
      <p className="phase-card__meta">
        {formatPhaseRange(phase.startDate, phase.endDate, undefined, status === 'upcoming' ? 'open' : 'now')}
      </p>

      {entry && figures && (
        <div className="phase-card__metrics">
          <IncomeViewToggle phaseId={phase.id} value={incomeView} onChange={setIncomeView} />
          <p className={`phase-card__leftover ${figures.savingsCapacityMinor >= 0 ? 'is-positive' : 'is-negative'}`}>
            <strong>{formatMinor(Math.abs(figures.savingsCapacityMinor), entry.currency)}</strong>{' '}
            {figures.savingsCapacityMinor >= 0 ? 'left each month' : 'short each month'}
            {burn !== null && (
              <span className="phase-card__burn" data-chip="burn">
                Burn rate: -{formatMinor(burn, entry.currency)}/mo
              </span>
            )}
          </p>
          {(savingsRate !== null || housing !== null) && (
            <div className="phase-card__ratios">
              {savingsRate !== null && (
                <div className="phase-bar-row" data-ratio="saved">
                  <span className="phase-bar-row__label">{savingsRate >= 0 ? 'Saved' : 'Over budget'}</span>
                  <span className="phase-bar" aria-hidden="true">
                    <span
                      className={`phase-bar__fill ${savingsRate >= 0 ? 'phase-bar__fill--saved' : 'phase-bar__fill--loss'}`}
                      style={{ width: `${barWidthPercent(Math.abs(savingsRate), 1)}%` }}
                    />
                  </span>
                  <span className="phase-bar-row__value">
                    {savingsRate >= 0 ? formatPercent(savingsRate) : `${formatPercent(Math.abs(savingsRate))} of income`}
                  </span>
                </div>
              )}
              {housing !== null && (
                <div className="phase-bar-row" data-ratio="housing" title="Rent and utilities, as a share of income">
                  <span className="phase-bar-row__label">Housing</span>
                  <span className="phase-bar" aria-hidden="true">
                    <span className="phase-bar__fill phase-bar__fill--housing" style={{ width: `${barWidthPercent(housing, 1)}%` }} />
                  </span>
                  <span className="phase-bar-row__value">{formatPercent(housing)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="phase-card__career">
        <p className="phase-card__career-summary" data-summary="income">
          {incomeSummary}
        </p>
        <button
          type="button"
          className="profile-text-button phase-card__career-trigger"
          aria-expanded={incomeOpen}
          aria-controls={`${id}-income`}
          onClick={() => setIncomeOpen((open) => !open)}
        >
          Income &amp; Career <span className="phase-card__career-add">· + Add job or income</span>
        </button>
      </div>
      {incomeOpen && (
        <div id={`${id}-income`} className="phase-card__income">
          <IncomeSection phase={phase} asOf={billing?.asOf ?? undefined} onUpdatePhase={onUpdatePhase} announce={announce} />
        </div>
      )}

      <div id={`${id}-details`} className="phase-card__details" aria-hidden={!expanded} inert={!expanded}>
        <div className="phase-card__details-inner">
          <PhaseDetails
            phase={phase}
            entry={entry}
            onUpdateCost={onUpdateCost}
            onDeleteCost={onDeleteCost}
            billing={billing}
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
