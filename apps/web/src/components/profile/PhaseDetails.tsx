import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { CreateFixedCostRequest, LivingPhaseDto, TimelineEntryDto, UpdateFixedCostRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { formatMonths } from '../../lib/duration';
import { formatMinor } from '../../lib/money';
import BenchmarksCard from './BenchmarksCard';
import BillsSection from './BillsSection';
import type { BillingView } from './billingView';
import { describeFailure } from './failureMessage';
import FixedCostEditor from './FixedCostEditor';
import { CADENCE_PHRASES, CATEGORY_GROUPS, CATEGORY_LABELS } from './labels';

interface PhaseDetailsProps {
  phase: LivingPhaseDto;
  entry: TimelineEntryDto | undefined;
  onAddCost: (phaseId: string, input: CreateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onUpdateCost: (phaseId: string, costId: string, input: UpdateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onDeleteCost: (phaseId: string, costId: string) => Promise<MutationResult<unknown>>;
  /** The bills received for this phase; absent where bills are not shown. */
  billing?: BillingView;
  /** Tells screen readers what just happened. */
  announce: (message: string) => void;
}

/** What opens up when a phase card is expanded: the monthly picture, the bills, and how to change them. */
export default function PhaseDetails({ phase, entry, onAddCost, onUpdateCost, onDeleteCost, billing, announce }: PhaseDetailsProps) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const monthly = entry?.fixedCostsByCategoryMinor;
  const breakdown = CATEGORY_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    rows: group.categories
      .map((category) => ({ category, amountMinor: monthly?.[category] ?? 0 }))
      .filter((row) => row.amountMinor !== 0),
  })).filter((group) => group.rows.length > 0);

  const addCost = async (input: CreateFixedCostRequest) => {
    const result = await onAddCost(phase.id, input);
    if (result.ok) {
      setAdding(false);
      announce('Cost added');
    }
    return result;
  };

  const updateCost = (costId: string) => async (input: CreateFixedCostRequest) => {
    const result = await onUpdateCost(phase.id, costId, input);
    if (result.ok) {
      setEditingId(null);
      announce('Cost updated');
    }
    return result;
  };

  const removeCost = async (costId: string) => {
    const result = await onDeleteCost(phase.id, costId);
    if (result.ok) {
      setConfirmingId(null);
      setRemoveError(null);
      announce('Cost removed');
    } else {
      setRemoveError(describeFailure(result.failure));
    }
  };

  return (
    <div className="phase-details">
      {entry && (
        <dl className="phase-stats">
          <div>
            <dt>Time here</dt>
            <dd>{formatMonths(entry.months)}</dd>
          </div>
          <div>
            <dt>Earned</dt>
            <dd>{formatMinor(entry.totalIncomeMinor, entry.currency)}</dd>
          </div>
          <div>
            <dt>Fixed costs paid</dt>
            <dd>{formatMinor(entry.totalFixedCostsMinor, entry.currency)}</dd>
          </div>
        </dl>
      )}

      <section aria-labelledby={`${id}-breakdown`}>
        <h4 className="phase-details__heading" id={`${id}-breakdown`}>
          Fixed costs per month
        </h4>
        {breakdown.length === 0 ? (
          <p className="phase-details__hint">No fixed costs yet. Add the bills you pay for this home.</p>
        ) : (
          <div className="phase-breakdown">
            {breakdown.map((group) => (
              <div key={group.id} className="phase-breakdown__group">
                {group.label && <p className="phase-breakdown__group-label">{group.label}</p>}
                <ul className="phase-breakdown__list">
                  {group.rows.map((row) => (
                    <li key={row.category} className="phase-breakdown__row" data-category={row.category}>
                      <span className="category-dot" aria-hidden="true" />
                      <span className="phase-breakdown__name">{CATEGORY_LABELS[row.category]}</span>
                      <span className="phase-breakdown__amount">{formatMinor(row.amountMinor, phase.currency)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby={`${id}-bills`}>
        <div className="phase-details__heading-row">
          <h4 className="phase-details__heading" id={`${id}-bills`}>
            Your bills
          </h4>
          {!adding && (
            <button
              type="button"
              className="profile-text-button"
              onClick={() => {
                setAdding(true);
                setEditingId(null);
              }}
            >
              <Plus size={14} aria-hidden="true" /> Add a cost
            </button>
          )}
        </div>

        {phase.fixedCosts.length > 0 && (
          <ul className="cost-list" aria-label="Fixed costs">
            {phase.fixedCosts.map((cost) => {
              const name = `${CATEGORY_LABELS[cost.category]}${cost.label ? ` ${cost.label}` : ''}`;
              return (
                <li key={cost.id} className="cost-row" data-category={cost.category}>
                  {editingId === cost.id ? (
                    <FixedCostEditor
                      initial={cost}
                      currency={phase.currency}
                      onSubmit={updateCost(cost.id)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <div className="cost-row__main">
                        <span className="category-dot" aria-hidden="true" />
                        <span className="cost-row__name">
                          {CATEGORY_LABELS[cost.category]}
                          {cost.label && <span className="cost-row__label"> · {cost.label}</span>}
                        </span>
                      </div>
                      <span className="cost-row__amount">
                        {formatMinor(cost.amountMinor, phase.currency)}{' '}
                        <span className="cost-row__cadence">{CADENCE_PHRASES[cost.cadence]}</span>
                      </span>
                      {confirmingId === cost.id ? (
                        <div className="confirm-inline" role="group" aria-label={`Confirm removing ${name}`}>
                          <span>Remove this cost?</span>
                          <button type="button" className="profile-danger-button" onClick={() => removeCost(cost.id)}>
                            Remove
                          </button>
                          <button type="button" className="profile-text-button" onClick={() => setConfirmingId(null)}>
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
                              setEditingId(cost.id);
                              setAdding(false);
                            }}
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="profile-icon-button"
                            aria-label={`Remove ${name}`}
                            onClick={() => setConfirmingId(cost.id)}
                          >
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

        {adding && <FixedCostEditor currency={phase.currency} onSubmit={addCost} onCancel={() => setAdding(false)} />}

        {removeError && (
          <p className="form-error-text" role="alert">
            {removeError}
          </p>
        )}
      </section>

      {billing && <BillsSection phase={phase} billing={billing} announce={announce} />}
      {billing?.benchmarks && <BenchmarksCard phaseId={phase.id} view={billing.benchmarks} />}
    </div>
  );
}
