import { useTranslation } from '../../i18n/useTranslation';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { BillingRecordDto, CreateBillingRecordRequest, LivingPhaseDto, UpdateBillingRecordRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { useSubmitOnce } from '../../hooks/useSubmitOnce';
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
  const words = useTranslation();
  const { t } = words;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const { run: runRemove, pending: removing } = useSubmitOnce();

  const sorted = [...records].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart));

  const updateBill = (recordId: string) => async (input: CreateBillingRecordRequest) => {
    const result = await onUpdate(recordId, toUpdate(input));
    if (result.ok) {
      setEditingId(null);
      announce(t('ledger.updated'));
    }
    return result;
  };

  const removeBill = (recordId: string) =>
    runRemove(async () => {
      const result = await onDelete(recordId);
      if (result.ok) {
        setConfirmingId(null);
        setRemoveError(null);
        announce(t('ledger.removed'));
      } else {
        setRemoveError(describeFailure(result.failure, [], words));
      }
    });

  return (
    <Modal label={t('ledger.label')} onClose={onClose}>
      <div className="expense-modal">
        <div>
          <h2 className="dialog__title">{t('ledger.title')}</h2>
        </div>

        <PdfPicker onFiles={onPickPdfs} />

        {sorted.length === 0 ? (
          <p className="phase-details__hint">{t('ledger.none')}</p>
        ) : (
          <ul className="cost-list bill-list" aria-label={t('ledger.list')}>
            {sorted.map((record) => {
              const name = t('ledger.billFrom', { category: t(CATEGORY_LABELS[record.category]), vendor: record.vendor });
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
                            <span className="cost-row__label"> · {t(CATEGORY_LABELS[record.category])}</span>
                          </span>
                          <span className="bill-row__period">{formatPhaseRange(record.periodStart, record.periodEnd, undefined, t('phase.now'))}</span>
                        </span>
                      </div>
                      <span className="cost-row__amount">
                        {formatMinor(record.amountMinor, record.currency)}{' '}
                        <span className="cost-row__cadence">{t(BILLING_CADENCE_PHRASES[record.cadence])}</span>
                      </span>
                      {confirmingId === record.id ? (
                        <div className="confirm-inline" role="group" aria-label={t('ledger.confirmRemoving', { name })}>
                          <span>{t('ledger.removeQuestion')}</span>
                          <button type="button" className="profile-danger-button" disabled={removing} aria-busy={removing} onClick={() => removeBill(record.id)}>
                            {t('ledger.remove')}
                          </button>
                          <button type="button" className="profile-text-button" onClick={() => setConfirmingId(null)}>
                            {t('ledger.keep')}
                          </button>
                        </div>
                      ) : (
                        <div className="cost-row__actions">
                          <button
                            type="button"
                            className="profile-icon-button"
                            aria-label={t('ledger.edit', { name })}
                            onClick={() => {
                              setEditingId(record.id);
                              setConfirmingId(null);
                            }}
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button type="button" className="profile-icon-button" aria-label={t('ledger.removeItem', { name })} onClick={() => setConfirmingId(record.id)}>
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
