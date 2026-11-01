import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { BillingRecordDto, CreateBillingRecordRequest, LivingPhaseDto, UpdateBillingRecordRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { formatMinor, formatPhaseRange } from '../../lib/money';
import Modal from '../Modal';
import BillEditor from './BillEditor';
import { toUpdate, type BillFormContext } from './billForm';
import { describeFailure } from './failureMessage';
import { BILLING_CADENCE_PHRASES, CATEGORY_LABELS } from './labels';
import PdfPicker from './PdfPicker';

interface BillsLedgerProps {
  phase: LivingPhaseDto;
  /** Every bill logged for this phase. */
  records: readonly BillingRecordDto[];
  context: BillFormContext;
  onUpdate: (recordId: string, input: UpdateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  onDelete: (recordId: string) => Promise<MutationResult<unknown>>;
  onPickPdfs: (files: File[]) => void;
  onClose: () => void;
  announce: (message: string) => void;
}

/** The raw past bills of a home, to look through, correct or remove. */
export default function BillsLedger({ phase, records, context, onUpdate, onDelete, onPickPdfs, onClose, announce }: BillsLedgerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const sorted = [...records].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart));

  const updateBill = (recordId: string) => async (input: CreateBillingRecordRequest) => {
    const result = await onUpdate(recordId, toUpdate(input));
    if (result.ok) {
      setEditingId(null);
      announce('Bill updated');
    }
    return result;
  };

  const removeBill = async (recordId: string) => {
    const result = await onDelete(recordId);
    if (result.ok) {
      setConfirmingId(null);
      setRemoveError(null);
      announce('Bill removed');
    } else {
      setRemoveError(describeFailure(result.failure));
    }
  };

  return (
    <Modal label="Manage bills and documents" onClose={onClose}>
      <div className="expense-modal">
        <div>
          <h2 className="dialog__title">Bills &amp; documents</h2>
          <p className="dialog__hint">Every bill logged for {phase.name}, newest first.</p>
        </div>

        <PdfPicker onFiles={onPickPdfs} />

        {sorted.length === 0 ? (
          <p className="phase-details__hint">No bills yet. Add an expense, or drop your PDFs above.</p>
        ) : (
          <ul className="cost-list bill-list" aria-label="Bills received">
            {sorted.map((record) => {
              const name = `${CATEGORY_LABELS[record.category]} bill from ${record.vendor}`;
              return (
                <li key={record.id} className="cost-row bill-row" data-category={record.category}>
                  {editingId === record.id ? (
                    <BillEditor
                      phaseId={phase.id}
                      currency={phase.currency}
                      context={context}
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
                              setConfirmingId(null);
                            }}
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button type="button" className="profile-icon-button" aria-label={`Remove ${name}`} onClick={() => setConfirmingId(record.id)}>
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

        {removeError && (
          <p className="form-error-text" role="alert">
            {removeError}
          </p>
        )}
      </div>
    </Modal>
  );
}
