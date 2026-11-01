import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { CreateBillingRecordRequest, CreateFixedCostRequest, LivingPhaseDto, TimelineEntryDto, UpdateFixedCostRequest, UpdateLivingPhaseRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { formatMonths } from '../../lib/duration';
import { formatMinor } from '../../lib/money';
import { vendorNamesMatch } from '../../contracts';
import BenchmarksCard from './BenchmarksCard';
import BillsLedger from './BillsLedger';
import type { BillFormContext } from './billForm';
import type { BillingView } from './billingView';
import { describeCostBasis, describeDeclaredCadence } from './describeCosts';
import DocumentReviewModal from './DocumentReviewModal';
import ExpenseModal from './ExpenseModal';
import { describeFailure } from './failureMessage';
import FixedCostEditor from './FixedCostEditor';
import IncomeSection from './IncomeSection';
import { CATEGORY_GROUPS, CATEGORY_LABELS } from './labels';

interface PhaseDetailsProps {
  phase: LivingPhaseDto;
  entry: TimelineEntryDto | undefined;
  onUpdatePhase: (phaseId: string, input: UpdateLivingPhaseRequest) => Promise<MutationResult<unknown>>;
  onAddCost: (phaseId: string, input: CreateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onUpdateCost: (phaseId: string, costId: string, input: UpdateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onDeleteCost: (phaseId: string, costId: string) => Promise<MutationResult<unknown>>;
  /** The bills received for this phase; absent where bills are not shown. */
  billing?: BillingView;
  /** Tells screen readers what just happened. */
  announce: (message: string) => void;
}

type Dialog = 'expense' | 'ledger' | null;

/** What opens up when a phase card is expanded: the income, the monthly costs, and how to change them. */
export default function PhaseDetails({ phase, entry, onUpdatePhase, onAddCost, onUpdateCost, onDeleteCost, billing, announce }: PhaseDetailsProps) {
  const id = useId();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const monthly = entry?.fixedCostsByCategoryMinor;
  const basisOf = entry?.costBasisByCategory;
  const breakdown = CATEGORY_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    rows: group.categories
      .map((category) => ({
        category,
        amountMinor: monthly?.[category] ?? 0,
        note: describeCostBasis(category, basisOf?.[category].basis ?? null, basisOf?.[category].billCount ?? 0),
        replaced: basisOf?.[category].basis === 'BILLS',
        declared: phase.fixedCosts.filter((cost) => cost.category === category),
      }))
      .filter((row) => row.amountMinor !== 0 || row.declared.length > 0 || row.note !== null),
  })).filter((group) => group.rows.length > 0);

  const context: BillFormContext = { today: billing?.asOf ?? null, countryCode: phase.countryCode, history: billing?.history ?? [] };

  const addExpense = async (input: CreateBillingRecordRequest) => {
    const result = await billing?.onAdd(input);
    if (result?.ok) {
      setDialog(null);
      announce('Expense added');
    }
    return result ?? { ok: false as const, failure: { kind: 'unknown' as const, message: 'Bills are not available here.' } };
  };

  /** A fixed rate: it replaces the declared cost it renews (same category, same name), otherwise it is a new one. */
  const addRate = async (input: CreateFixedCostRequest) => {
    const renewed = input.label
      ? phase.fixedCosts.find((cost) => cost.category === input.category && cost.label !== null && vendorNamesMatch(cost.label, input.label as string))
      : undefined;
    const result = renewed ? await onUpdateCost(phase.id, renewed.id, input) : await onAddCost(phase.id, input);
    if (result.ok) {
      setDialog(null);
      announce(renewed ? 'Cost updated' : 'Cost added');
    }
    return result;
  };

  const saveFromDocument = async (input: CreateBillingRecordRequest) => {
    const result = await billing?.onAdd(input);
    if (result?.ok) announce('Bill logged');
    return result ?? { ok: false as const, failure: { kind: 'unknown' as const, message: 'Bills are not available here.' } };
  };

  const pickPdfs = (files: File[]) => {
    setDialog(null);
    setPdfFiles(files);
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

      <IncomeSection phase={phase} onUpdatePhase={onUpdatePhase} announce={announce} />

      <section aria-labelledby={`${id}-breakdown`}>
        <div className="phase-details__heading-row">
          <h4 className="phase-details__heading" id={`${id}-breakdown`}>
            Fixed costs per month
          </h4>
          {billing && (
            <div className="phase-details__actions">
              <button type="button" className="profile-text-button" onClick={() => setDialog('expense')}>
                <Plus size={14} aria-hidden="true" /> Add an expense
              </button>
              <button type="button" className="profile-text-button" onClick={() => setDialog('ledger')}>
                <FileText size={14} aria-hidden="true" /> Manage bills &amp; documents
              </button>
            </div>
          )}
        </div>

        {breakdown.length === 0 ? (
          <p className="phase-details__hint">No fixed costs yet. Add the bills you pay for this home.</p>
        ) : (
          <div className="phase-breakdown">
            {breakdown.map((group) => (
              <div key={group.id} className="phase-breakdown__group">
                {group.label && <p className="phase-breakdown__group-label">{group.label}</p>}
                <ul className="phase-breakdown__list">
                  {group.rows.map((row) => (
                    <li key={row.category} className="phase-breakdown__item" data-category={row.category}>
                      <div className="phase-breakdown__row">
                        <span className="category-dot" aria-hidden="true" />
                        <span className="phase-breakdown__name">
                          {CATEGORY_LABELS[row.category]}
                          {row.note && <span className="phase-breakdown__note">{row.note}</span>}
                        </span>
                        <span className="phase-breakdown__amount">{formatMinor(row.amountMinor, phase.currency)}</span>
                      </div>

                      {row.declared.length > 0 && (
                        <ul className="cost-list cost-list--nested" aria-label={`Declared ${CATEGORY_LABELS[row.category]} costs`}>
                          {row.declared.map((cost) => {
                            const name = `${CATEGORY_LABELS[cost.category]}${cost.label ? ` ${cost.label}` : ''}`;
                            const cadence = describeDeclaredCadence(cost.category, cost.cadence);
                            return (
                              <li key={cost.id} className={`cost-row${row.replaced ? ' is-replaced' : ''}`} data-category={cost.category}>
                                {editingId === cost.id ? (
                                  <FixedCostEditor initial={cost} currency={phase.currency} onSubmit={updateCost(cost.id)} onCancel={() => setEditingId(null)} />
                                ) : (
                                  <>
                                    <div className="cost-row__main">
                                      <span className="cost-row__name">
                                        <span className="cost-row__struck">{cost.label ?? 'Declared'}</span>
                                        {row.replaced && <span className="cost-row__label"> · replaced by your bills</span>}
                                      </span>
                                    </div>
                                    <span className="cost-row__amount">
                                      {formatMinor(cost.amountMinor, phase.currency)}
                                      {cadence && <span className="cost-row__cadence"> {cadence}</span>}
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
                                            setConfirmingId(null);
                                          }}
                                        >
                                          <Pencil size={14} aria-hidden="true" />
                                        </button>
                                        <button type="button" className="profile-icon-button" aria-label={`Remove ${name}`} onClick={() => setConfirmingId(cost.id)}>
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
                    </li>
                  ))}
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

      {billing?.benchmarks && <BenchmarksCard phaseId={phase.id} view={billing.benchmarks} />}

      {billing && dialog === 'expense' && (
        <ExpenseModal phase={phase} context={context} onSubmit={addExpense} onSubmitRate={addRate} onPickPdfs={pickPdfs} onClose={() => setDialog(null)} />
      )}
      {billing && dialog === 'ledger' && (
        <BillsLedger
          phase={phase}
          records={billing.recordsFor(phase.id)}
          context={context}
          onUpdate={billing.onUpdate}
          onDelete={billing.onDelete}
          onPickPdfs={pickPdfs}
          onClose={() => setDialog(null)}
          announce={announce}
        />
      )}
      {billing && pdfFiles.length > 0 && (
        <DocumentReviewModal
          files={pdfFiles}
          phases={billing.phases ?? [phase]}
          today={billing.asOf}
          history={billing.history}
          openedFromPhaseId={phase.id}
          onSave={saveFromDocument}
          onClose={() => setPdfFiles([])}
        />
      )}
    </div>
  );
}
