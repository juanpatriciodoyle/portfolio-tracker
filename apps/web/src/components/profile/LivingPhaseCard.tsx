import { useTranslation } from '../../i18n/useTranslation';
import { ChevronDown, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { incomeReferenceDay, type LivingPhaseDto, type TimelineEntryDto, type UpdateFixedCostRequest, type UpdateLivingPhaseRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { formatCalendarDate, formatMinor, formatPercent, formatPhaseRange } from '../../lib/money';
import { phaseAddress } from '../../lib/phaseName';
import { barWidthPercent } from '../../lib/scale';
import type { BillingView } from './billingView';
import { describeFailure } from './failureMessage';
import { STATUS_LABELS } from './labels';
import IncomeSection from './IncomeSection';
import { summarizeActiveIncome } from './incomeSummary';
import PhaseBills from './PhaseBills';
import PhaseDetails from './PhaseDetails';
import IncomeViewToggle from './IncomeViewToggle';
import { burnRateMinor, housingBurden, incomeFigures, incomeViewsDiffer, type IncomeView } from './phaseRatios';
import { costTrend, describeTrend, savingsTrend, type PhaseTrend } from './phaseTrend';
import { intlLocale } from '../../i18n/locale';
import { useSubmitOnce } from '../../hooks/useSubmitOnce';

interface LivingPhaseCardProps {
  phase: LivingPhaseDto;
  /** The computed month-by-month picture; absent only for a moment after a change. */
  entry: TimelineEntryDto | undefined;
  /** The home lived in just before this one, to say how what is kept changed since. */
  previousEntry?: TimelineEntryDto;
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
  previousEntry,
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
  const words = useTranslation();
  const { t, locale } = words;
  const id = useId();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { run: runDelete, pending: deleting } = useSubmitOnce();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [incomeView, setIncomeView] = useState<IncomeView>('current');
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [billsOpen, setBillsOpen] = useState(false);
  /** Each press of "Add job" opens the income list with the form to add one. */
  const [addJobPresses, setAddJobPresses] = useState(0);

  const status = entry?.status;
  const address = phaseAddress(phase);
  const viewsDiffer = entry ? incomeViewsDiffer(entry) : false;
  const shownView: IncomeView = viewsDiffer ? incomeView : 'current';
  const figures = entry ? incomeFigures(entry, shownView) : null;
  const housing = entry && figures ? housingBurden({ monthlyIncomeMinor: figures.incomeMinor, fixedCostsByCategoryMinor: entry.fixedCostsByCategoryMinor }) : null;
  const savingsRate = figures?.savingsRate ?? null;
  const burn = figures ? burnRateMinor(figures) : null;
  // The income that counts is the one paying on today; a past home shows its last day, one still ahead its first.
  const incomeDay = incomeReferenceDay(phase, billing?.asOf ?? phase.endDate ?? phase.startDate);
  const incomeSummary = summarizeActiveIncome(phase.incomeStreams, incomeDay, (amountMinor) => formatMinor(amountMinor, phase.currency), (day) => formatCalendarDate(day), t, { past: status === 'past' });

  const records = billing?.recordsFor(phase.id);
  const asOf = billing?.asOf ?? null;
  const previousSavingsRate = previousEntry ? incomeFigures(previousEntry, shownView).savingsRate : null;
  // What changed, in one line: the bills say it best; failing that, what is kept against the previous home.
  const previousName = previousEntry?.name ?? null;
  const costs = records && asOf ? costTrend(records, asOf, phase.currency) : null;
  const kept = savingsTrend(savingsRate, previousSavingsRate);
  const trend: PhaseTrend | null = costs ?? (kept && previousName !== null ? { ...kept, previousName } : null);

  const confirmDelete = () =>
    runDelete(async () => {
      const result = await onDelete();
      if (!result.ok) setDeleteError(describeFailure(result.failure, [], words));
    });

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
        {status && <span className={`phase-status phase-status--${status}`}>{t(STATUS_LABELS[status])}</span>}
        {onToggleCompare && (
          <button
            type="button"
            className={`profile-toggle-button${compareSelected ? ' is-on' : ''}`}
            aria-pressed={compareSelected}
            onClick={onToggleCompare}
          >
            {t('card.compare')}
          </button>
        )}
      </header>

      {address && <p className="phase-card__address">{address}</p>}
      <p className="phase-card__meta">
        {formatPhaseRange(phase.startDate, phase.endDate, undefined, status === 'upcoming' ? t('phase.open') : t('phase.now'))}
      </p>

      {entry && figures && (
        <div className="phase-card__metrics">
          {viewsDiffer ? (
            <IncomeViewToggle phaseId={phase.id} value={incomeView} onChange={setIncomeView} />
          ) : (
            entry.monthlyIncomeMinor > 0 && (
              <p className="phase-card__steady" data-income="steady">
                {t('card.steadyIncome')}
              </p>
            )
          )}
          <p className={`phase-card__leftover ${figures.savingsCapacityMinor >= 0 ? 'is-positive' : 'is-negative'}`}>
            <strong>{formatMinor(Math.abs(figures.savingsCapacityMinor), entry.currency)}</strong>{' '}
            {figures.savingsCapacityMinor >= 0 ? t('card.left') : t('card.short')}
            {burn !== null && (
              <span className="phase-card__burn" data-chip="burn">
                {t('card.burn', { amount: formatMinor(burn, entry.currency) })}
              </span>
            )}
          </p>
          {(savingsRate !== null || housing !== null) && (
            <div className="phase-card__ratios">
              {savingsRate !== null && (
                <div className="phase-bar-row" data-ratio="saved">
                  <span className="phase-bar-row__label">{savingsRate >= 0 ? t('card.saved') : t('card.overBudget')}</span>
                  <span className="phase-bar" aria-hidden="true">
                    <span
                      className={`phase-bar__fill ${savingsRate >= 0 ? 'phase-bar__fill--saved' : 'phase-bar__fill--loss'}`}
                      style={{ width: `${barWidthPercent(Math.abs(savingsRate), 1)}%` }}
                    />
                  </span>
                  <span className="phase-bar-row__value">
                    {savingsRate >= 0 ? formatPercent(savingsRate) : t('card.ofIncome', { percent: formatPercent(Math.abs(savingsRate)) })}
                  </span>
                </div>
              )}
              {housing !== null && (
                <div className="phase-bar-row" data-ratio="housing" title={t('card.housingHint')}>
                  <span className="phase-bar-row__label">{t('phaseFields.housing')}</span>
                  <span className="phase-bar" aria-hidden="true">
                    <span className="phase-bar__fill phase-bar__fill--housing" style={{ width: `${barWidthPercent(housing, 1)}%` }} />
                  </span>
                  <span className="phase-bar-row__value">{formatPercent(housing)}</span>
                </div>
              )}
            </div>
          )}
          {trend && (
            <p className="phase-card__trend" data-trend={'changeMinor' in trend ? 'costs' : 'savings'}>
              {describeTrend(trend, entry.currency, intlLocale(locale), t)}
            </p>
          )}
        </div>
      )}

      <div className="phase-card__career">
        <p className="phase-card__career-summary" data-summary="income">
          {incomeSummary}
        </p>
        <div className="phase-card__career-actions">
          <button
            type="button"
            className="profile-text-button phase-card__career-trigger"
            aria-expanded={incomeOpen}
            aria-controls={`${id}-income`}
            onClick={() => setIncomeOpen((open) => !open)}
          >
            {t('card.incomeCareer')}
          </button>
          <button
            type="button"
            className="profile-action-button profile-action-button--outline phase-card__add-job"
            onClick={() => {
              setIncomeOpen(true);
              setAddJobPresses((presses) => presses + 1);
            }}
          >
            <Plus size={14} aria-hidden="true" /> {t('card.addJob')}
          </button>
        </div>
      </div>
      {billing && (
        <div className="phase-card__bills">
          {entry && <p className="phase-card__bills-summary">{t('card.costsLine', { amount: formatMinor(entry.monthlyFixedCostsMinor, entry.currency) })}</p>}
          <button
            type="button"
            className="profile-action-button profile-action-button--outline phase-card__bills-button"
            onClick={() => setBillsOpen(true)}
          >
            <FileText size={14} aria-hidden="true" /> {t('card.billsAndCosts')}
          </button>
        </div>
      )}
      {incomeOpen && (
        <div id={`${id}-income`} className="phase-card__income">
          <IncomeSection phase={phase} asOf={billing?.asOf ?? undefined} addRequests={addJobPresses} onUpdatePhase={onUpdatePhase} announce={announce} />
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
              <div className="confirm-inline" role="group" aria-label={t('card.confirmDelete', { name: phase.name })}>
                <span>{t('card.deletePrompt', { name: phase.name })}</span>
                <button type="button" className="profile-danger-button" onClick={confirmDelete} disabled={deleting} aria-busy={deleting}>
                  {deleting ? t('card.deleting') : t('common.delete')}
                </button>
                <button type="button" className="profile-text-button" onClick={() => setConfirmingDelete(false)}>
                  {t('ledger.keep')}
                </button>
              </div>
            ) : (
              <>
                <button type="button" className="profile-text-button" onClick={onEdit}>
                  <Pencil size={14} aria-hidden="true" /> {t('card.editPhase')}
                </button>
                <button
                  type="button"
                  className="profile-text-button profile-text-button--danger"
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmingDelete(true);
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" /> {t('card.deletePhase')}
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
      {billing && <PhaseBills phase={phase} entry={entry} billing={billing} open={billsOpen} onClose={() => setBillsOpen(false)} announce={announce} />}
    </article>
  );
}
