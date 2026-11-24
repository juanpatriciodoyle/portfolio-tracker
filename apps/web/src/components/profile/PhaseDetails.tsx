import { useTranslation } from '../../i18n/useTranslation';
import { CalendarX, Pencil, Trash2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { CreateFixedCostRequest, LivingPhaseDto, TimelineEntryDto, UpdateFixedCostRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { formatMonths } from '../../lib/duration';
import { clampDateYear } from '../../lib/inputFilters';
import { formatCalendarDate, formatMinor } from '../../lib/money';
import { useSubmitOnce } from '../../hooks/useSubmitOnce';
import type { BillingView } from './billingView';
import { describeCostBasis, describeDeclaredCadence } from './describeCosts';
import { describeFailure } from './failureMessage';
import FixedCostEditor from './FixedCostEditor';
import { CADENCE_LABELS, CATEGORY_GROUPS, CATEGORY_LABELS } from './labels';

interface PhaseDetailsProps {
  phase: LivingPhaseDto;
  entry: TimelineEntryDto | undefined;
  onUpdateCost: (phaseId: string, costId: string, input: UpdateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onDeleteCost: (phaseId: string, costId: string) => Promise<MutationResult<unknown>>;
  /** What the card knows about today: the last day offered when ending a cost. */
  billing?: BillingView;
  /** Tells screen readers what just happened. */
  announce: (message: string) => void;
}

/** What opens up when a phase card is expanded: the income, the monthly costs, and how to change them. */
export default function PhaseDetails({ phase, entry, onUpdateCost, onDeleteCost, billing, announce }: PhaseDetailsProps) {
  const words = useTranslation();
  const { t } = words;
  const id = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [lastDay, setLastDay] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  /** Ending or removing a cost: one at a time, however fast the button is tapped. */
  const { run: runCostAction, pending: costBusy } = useSubmitOnce();

  const monthly = entry?.fixedCostsByCategoryMinor;
  const basisOf = entry?.costBasisByCategory;
  const breakdown = CATEGORY_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    rows: group.categories
      .map((category) => ({
        category,
        amountMinor: monthly?.[category] ?? 0,
        note: describeCostBasis(category, basisOf?.[category].basis ?? null, basisOf?.[category].billCount ?? 0, t),
        replaced: basisOf?.[category].basis === 'BILLS',
        declared: phase.fixedCosts.filter((cost) => cost.category === category),
      }))
      .filter((row) => row.amountMinor !== 0 || row.declared.length > 0 || row.note !== null),
  })).filter((group) => group.rows.length > 0);

  const updateCost = (costId: string) => async (input: CreateFixedCostRequest) => {
    const result = await onUpdateCost(phase.id, costId, input);
    if (result.ok) {
      setEditingId(null);
      announce(t('details.costUpdated'));
    }
    return result;
  };

  const endCost = (costId: string) =>
    runCostAction(async () => {
      const result = await onUpdateCost(phase.id, costId, { endDate: lastDay });
      if (result.ok) {
        setEndingId(null);
        setRemoveError(null);
        announce(t('details.subscriptionEnded'));
      } else {
        setRemoveError(describeFailure(result.failure, [], words));
      }
    });

  const removeCost = (costId: string) =>
    runCostAction(async () => {
      const result = await onDeleteCost(phase.id, costId);
      if (result.ok) {
        setConfirmingId(null);
        setRemoveError(null);
        announce(t('details.costRemoved'));
      } else {
        setRemoveError(describeFailure(result.failure, [], words));
      }
    });

  /** Edit and remove for one declared cost, or the question that confirms removing it. */
  const costControls = (cost: LivingPhaseDto['fixedCosts'][number]): ReactNode => {
    const name = `${t(CATEGORY_LABELS[cost.category])}${cost.label ? ` ${cost.label}` : ''}`;
    if (endingId === cost.id) {
      return (
        <div className="confirm-inline" role="group" aria-label={t('details.confirmEnding', { name })}>
          <label htmlFor={`${id}-last-day-${cost.id}`}>{t('details.lastDay')}</label>
          <input
            id={`${id}-last-day-${cost.id}`}
            type="date"
            className="form-input"
            value={lastDay}
            onChange={(event) => setLastDay(clampDateYear(event.target.value))}
          />
          <button type="button" className="profile-danger-button" disabled={lastDay === '' || costBusy} aria-busy={costBusy} onClick={() => endCost(cost.id)}>
            {t('details.endSubscription')}
          </button>
          <button type="button" className="profile-text-button" onClick={() => setEndingId(null)}>
            {t('ledger.keep')}
          </button>
        </div>
      );
    }
    return confirmingId === cost.id ? (
      <div className="confirm-inline" role="group" aria-label={t('ledger.confirmRemoving', { name })}>
        <span>{t('details.removeCostQuestion')}</span>
        <button type="button" className="profile-danger-button" disabled={costBusy} aria-busy={costBusy} onClick={() => removeCost(cost.id)}>
          {t('ledger.remove')}
        </button>
        <button type="button" className="profile-text-button" onClick={() => setConfirmingId(null)}>
          {t('ledger.keep')}
        </button>
      </div>
    ) : (
      <div className="cost-row__actions">
        {cost.endDate === null && (
          <button
            type="button"
            className="profile-icon-button"
            aria-label={t('details.endSubscriptionNamed', { name })}
            onClick={() => {
              setEndingId(cost.id);
              setLastDay(billing?.asOf ?? '');
              setConfirmingId(null);
              setEditingId(null);
            }}
          >
            <CalendarX size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="profile-icon-button"
          aria-label={t('ledger.edit', { name })}
          onClick={() => {
            setEditingId(cost.id);
            setConfirmingId(null);
          }}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button type="button" className="profile-icon-button" aria-label={t('ledger.removeItem', { name })} onClick={() => setConfirmingId(cost.id)}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    );
  };

  return (
    <div className="phase-details">
      {entry && (
        <dl className="phase-stats">
          <div>
            <dt>{t('details.timeHere')}</dt>
            <dd>{formatMonths(entry.months, t)}</dd>
          </div>
        </dl>
      )}

      <section aria-labelledby={`${id}-breakdown`}>
        <div className="phase-details__heading-row">
          <h4 className="phase-details__heading" id={`${id}-breakdown`}>
            {t('details.fixedCostsPerMonth')}
          </h4>
        </div>

        {breakdown.length > 0 && (
          <div className="phase-breakdown">
            {breakdown.map((group) => (
              <div key={group.id} className="phase-breakdown__group">
                {group.label && <p className="phase-breakdown__group-label">{t(group.label)}</p>}
                <ul className="phase-breakdown__list">
                  {group.rows.map((row) => {
                    // One declared cost that no bill has replaced is the row itself: nothing is repeated underneath it.
                    const sole = row.declared.length === 1 && !row.replaced ? row.declared[0] : null;
                    const cadence = sole?.endDate ? t('details.ended', { date: formatCalendarDate(sole.endDate) }) : sole && sole.category !== 'TAXES' ? t(CADENCE_LABELS[sole.cadence]) : null;
                    return (
                      <li key={row.category} className={`phase-breakdown__item${sole?.endDate ? ' is-ended' : ''}`} data-category={row.category}>
                        {sole && editingId === sole.id ? (
                          <FixedCostEditor initial={sole} currency={phase.currency} onSubmit={updateCost(sole.id)} onCancel={() => setEditingId(null)} />
                        ) : (
                          <div className={`phase-breakdown__row${sole ? ' phase-breakdown__row--editable' : ''}`} title={row.note ?? undefined}>
                            <span className="category-dot" aria-hidden="true" />
                            <span className="phase-breakdown__name">
                              <span>{t(CATEGORY_LABELS[row.category])}</span>
                              {(cadence ?? row.note) && <span className="phase-breakdown__note">{cadence ?? row.note}</span>}
                            </span>
                            {!sole?.endDate && <span className="phase-breakdown__amount">{formatMinor(row.amountMinor, phase.currency)}</span>}
                            {sole && costControls(sole)}
                          </div>
                        )}

                        {!sole && row.declared.length > 0 && (
                          <ul className="cost-list cost-list--nested" aria-label={t('details.declaredCosts', { category: t(CATEGORY_LABELS[row.category]) })}>
                            {row.declared.map((cost) => {
                              const declaredCadence = describeDeclaredCadence(cost.category, cost.cadence, t);
                              return (
                                <li
                                  key={cost.id}
                                  className={`cost-row${row.replaced ? ' is-replaced' : ''}${cost.endDate ? ' is-ended' : ''}`}
                                  data-category={cost.category}
                                  title={row.replaced ? t('details.replaced') : undefined}
                                >
                                  {editingId === cost.id ? (
                                    <FixedCostEditor initial={cost} currency={phase.currency} onSubmit={updateCost(cost.id)} onCancel={() => setEditingId(null)} />
                                  ) : (
                                    <>
                                      <div className="cost-row__main">
                                        <span className="cost-row__name">
                                          <span className="cost-row__struck">{cost.label ?? t('details.declared')}</span>
                                          {cost.endDate && <span className="phase-breakdown__note"> {t('details.ended', { date: formatCalendarDate(cost.endDate) })}</span>}
                                        </span>
                                      </div>
                                      <span className="cost-row__amount">
                                        {formatMinor(cost.amountMinor, phase.currency)}
                                        {declaredCadence && <span className="cost-row__cadence"> {declaredCadence}</span>}
                                      </span>
                                      {costControls(cost)}
                                    </>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {removeError && (
          <p className="form-error-text" role="alert">
            {removeError}
          </p>
        )}
      </section>

    </div>
  );
}
