import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { CreateBillingRecordRequest, LivingPhaseDto } from '../../contracts';
import { formatMinor, formatPhaseRange } from '../../lib/money';
import BillEditor from './BillEditor';
import { toUpdate } from './billForm';
import type { BillingView } from './billingView';
import { describeDrift } from './describeTrends';
import { describeFailure } from './failureMessage';
import { BILLING_CADENCE_PHRASES, CATEGORY_LABELS } from './labels';

interface BillsSectionProps {
  phase: LivingPhaseDto;
  billing: BillingView;
  announce: (message: string) => void;
}

const RECENT_COUNT = 5;

/** The bills that really arrived for a phase, and how they compare with what was declared. */
export default function BillsSection({ phase, billing, announce }: BillsSectionProps) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const records = [...billing.recordsFor(phase.id)].sort(
    (a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart)
  );
  const visible = showAll ? records : records.slice(0, RECENT_COUNT);
  const drift = describeDrift(records.length > 0 ? billing.observedFor(phase.id) : undefined);

  const addBill = async (input: CreateBillingRecordRequest) => {
    const result = await billing.onAdd(input);
    if (result.ok) {
      setAdding(false);
      announce('Bill logged');
    }
    return result;
  };

  const updateBill = (recordId: string) => async (input: CreateBillingRecordRequest) => {
    const result = await billing.onUpdate(recordId, toUpdate(input));
    if (result.ok) {
      setEditingId(null);
      announce('Bill updated');
    }
    return result;
  };

  const removeBill = async (recordId: string) => {
    const result = await billing.onDelete(recordId);
    if (result.ok) {
      setConfirmingId(null);
      setRemoveError(null);
      announce('Bill removed');
    } else {
      setRemoveError(describeFailure(result.failure));
    }
  };

  return (
    <section aria-labelledby={`${id}-bills-received`} className="bills-section">
      <div className="phase-details__heading-row">
        <h4 className="phase-details__heading" id={`${id}-bills-received`}>
          Bills received
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
            <Plus size={14} aria-hidden="true" /> Log a bill
          </button>
        )}
      </div>

      {drift && (
        <p className={`bills-drift is-${drift.direction}`}>
          {drift.sentence} <span className="bills-drift__basis">{drift.basis}</span>
        </p>
      )}

      {records.length === 0 && !adding && (
        <p className="phase-details__hint">
          No bills logged yet. Log what actually arrives to see how your real costs compare with what you declared.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="cost-list bill-list" aria-label="Bills received">
          {visible.map((record) => {
            const name = `${CATEGORY_LABELS[record.category]} bill from ${record.vendor}`;
            return (
              <li key={record.id} className="cost-row bill-row" data-category={record.category}>
                {editingId === record.id ? (
                  <BillEditor
                    phaseId={phase.id}
                    currency={phase.currency}
                    asOf={billing.asOf}
                    initial={record}
                    onSubmit={updateBill(record.id)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="cost-row__main bill-row__main">
                      <span className="category-dot" aria-hidden="true" />
                      <span className="bill-row__text">
                        <span className="cost-row__name">
                          {record.vendor}
                          <span className="cost-row__label"> · {CATEGORY_LABELS[record.category]}</span>
                        </span>
                        <span className="bill-row__period">{formatPhaseRange(record.periodStart, record.periodEnd, undefined, 'now')}</span>
                      </span>
                    </div>
                    <span className="cost-row__amount">
                      {formatMinor(record.amountMinor, record.currency)}{' '}
                      <span className="cost-row__cadence">{BILLING_CADENCE_PHRASES[record.cadence]}</span>
                    </span>
                    {confirmingId === record.id ? (
                      <div className="confirm-inline" role="group" aria-label={`Confirm removing ${name}`}>
                        <span>Remove this bill?</span>
                        <button type="button" className="profile-danger-button" onClick={() => removeBill(record.id)}>
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
                            setEditingId(record.id);
                            setAdding(false);
                          }}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="profile-icon-button"
                          aria-label={`Remove ${name}`}
                          onClick={() => setConfirmingId(record.id)}
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

      {records.length > RECENT_COUNT && (
        <button type="button" className="profile-text-button bills-section__more" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Show fewer bills' : `Show all ${records.length} bills`}
        </button>
      )}

      {adding && (
        <BillEditor phaseId={phase.id} currency={phase.currency} asOf={billing.asOf} onSubmit={addBill} onCancel={() => setAdding(false)} />
      )}

      {removeError && (
        <p className="form-error-text" role="alert">
          {removeError}
        </p>
      )}
    </section>
  );
}
