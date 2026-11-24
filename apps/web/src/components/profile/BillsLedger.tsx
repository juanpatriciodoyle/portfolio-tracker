import { useTranslation } from '../../i18n/useTranslation';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { BillingRecordDto, CreateBillingRecordRequest, LivingPhaseDto, TimelineEntryDto, UpdateBillingRecordRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { useSubmitOnce } from '../../hooks/useSubmitOnce';
import { formatCalendarDate, formatMinor, formatPhaseRange } from '../../lib/money';
import Modal from '../Modal';
import BillEditor from './BillEditor';
import { toUpdate, type BillFormContext } from './billForm';
import { phaseCostStats, type CategoryCostLine } from './billsSummary';
import { describeCostBasis } from './describeCosts';
import { describeFailure } from './failureMessage';
import { BILLING_CADENCE_PHRASES, CATEGORY_LABELS } from './labels';
import PdfPicker from './PdfPicker';

interface BillsLedgerProps {
  phase: LivingPhaseDto;
  /** The month-by-month picture of this home, where the averages come from; absent only for a moment after a change. */
  entry: TimelineEntryDto | undefined;
  /** Every bill logged for this phase. */
  records: readonly BillingRecordDto[];
  context: BillFormContext;
  onUpdate: (recordId: string, input: UpdateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  onDelete: (recordId: string) => Promise<MutationResult<unknown>>;
  onPickPdfs: (files: File[]) => void;
  onClose: () => void;
  announce: (message: string) => void;
}

/**
 * The costs and bills of one home, current or past: what it costs a month and what that rests on, then each category with the
 * bills behind it to look through, correct or remove.
 */
export default function BillsLedger({ phase, entry, records, context, onUpdate, onDelete, onPickPdfs, onClose, announce }: BillsLedgerProps) {
  const words = useTranslation();
  const { t } = words;
  const id = useId();
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const { run: runRemove, pending: removing } = useSubmitOnce();

  const stats = phaseCostStats(entry, records);
  const money = (amountMinor: number) => formatMinor(amountMinor, phase.currency);
  // Bills that fit no listed category (a moment after a change, before the picture is back) are still shown, never lost.
  const flat = stats.lines.length === 0 ? [...records].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart)) : [];

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

  /** Inside a category the category is already known: it is only repeated in the flat list. */
  const renderBill = (record: BillingRecordDto, showCategory: boolean) => {
    const name = t('ledger.billFrom', { category: t(CATEGORY_LABELS[record.category]), vendor: record.vendor });
    return (
      <li key={record.id} className="cost-row bill-row" data-category={record.category}>
        {editingId === record.id ? (
          <BillEditor phaseId={phase.id} currency={phase.currency} context={context} initial={record} onSubmit={updateBill(record.id)} onCancel={() => setEditingId(null)} />
        ) : (
          <>
            <div className="cost-row__main bill-row__main">
              <span className="category-dot" aria-hidden="true" />
              <span className="bill-row__text">
                <span className="cost-row__name">
                  {record.vendor}
                  {showCategory && <span className="cost-row__label"> · {t(CATEGORY_LABELS[record.category])}</span>}
                </span>
                <span className="bill-row__period">{formatPhaseRange(record.periodStart, record.periodEnd, undefined, t('phase.now'))}</span>
              </span>
            </div>
            <span className="cost-row__amount">
              {formatMinor(record.amountMinor, record.currency)} <span className="cost-row__cadence">{t(BILLING_CADENCE_PHRASES[record.cadence])}</span>
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
  };

  /** What a category's number rests on, in a few words: its bills, the declared rate, or both. */
  const basisNote = (line: CategoryCostLine) =>
    describeCostBasis(line.category, line.basis, line.billCount, t) ?? (line.basis === 'DECLARED' ? t('costsDialog.declaredRate') : null);

  const renderCategory = (line: CategoryCostLine) => {
    const label = t(CATEGORY_LABELS[line.category]);
    const hasBills = line.records.length > 0;
    const open = openCategory === line.category;
    const differs = (line.basis === 'BILLS' || line.basis === 'MIXED') && line.declaredMonthlyMinor > 0 && line.declaredMonthlyMinor !== line.monthlyMinor;
    const listId = `${id}-${line.category}`;
    const heading = (
      <>
        <span className="category-dot" aria-hidden="true" />
        <span className="phase-breakdown__name">
          <span>{label}</span>
          {basisNote(line) && <span className="phase-breakdown__note">{basisNote(line)}</span>}
          {differs && <span className="phase-breakdown__note">{t('costsDialog.declaredWas', { amount: money(line.declaredMonthlyMinor) })}</span>}
        </span>
        <span className="phase-breakdown__amount">{money(line.monthlyMinor)}</span>
      </>
    );
    return (
      <li key={line.category} className="costs-category" data-category={line.category}>
        {hasBills ? (
          <button type="button" className="costs-category__row costs-category__row--button" aria-expanded={open} aria-controls={listId} onClick={() => setOpenCategory(open ? null : line.category)}>
            {heading}
            <ChevronDown className="costs-category__chevron" size={16} aria-hidden="true" />
          </button>
        ) : (
          <div className="costs-category__row">{heading}</div>
        )}
        {hasBills && open && (
          <ul id={listId} className="cost-list bill-list costs-category__bills" aria-label={t('costsDialog.categoryBills', { category: label })}>
            {line.records.map((record) => renderBill(record, false))}
          </ul>
        )}
      </li>
    );
  };

  const difference = stats.fromBillsVsDeclaredMinor;

  return (
    <Modal label={t('ledger.label')} onClose={onClose}>
      <div className="expense-modal">
        <div>
          <h2 className="dialog__title">{t('card.billsAndCosts')}</h2>
          <p className="phase-details__hint">
            {phase.name} · {formatPhaseRange(phase.startDate, phase.endDate, undefined, t('phase.now'))}
          </p>
        </div>

        <section className="costs-summary" aria-label={t('costsDialog.monthly')}>
          <p className="costs-summary__label">{t('costsDialog.monthly')}</p>
          <p className="costs-summary__amount">{money(stats.totalMonthlyMinor)}</p>
          <p className="phase-details__hint">
            {stats.billsCount === 0
              ? t('costsDialog.noBills')
              : t('costsDialog.basedOnBills', {
                  bills: t('costs.bills', { count: stats.billsCount }),
                  from: formatCalendarDate(stats.coveredFrom as string),
                  to: formatCalendarDate(stats.coveredTo as string),
                })}
          </p>
          {difference !== null && (
            <p className="phase-details__hint" data-difference={difference === 0 ? 'same' : difference > 0 ? 'above' : 'below'}>
              {difference === 0
                ? t('costsDialog.matchesDeclared')
                : t(difference > 0 ? 'costsDialog.aboveDeclared' : 'costsDialog.belowDeclared', { amount: money(Math.abs(difference)) })}
            </p>
          )}
        </section>

        <PdfPicker onFiles={onPickPdfs} />

        {stats.lines.length > 0 && (
          <ul className="costs-categories" aria-label={t('costsDialog.categories')}>
            {stats.lines.map(renderCategory)}
          </ul>
        )}

        {flat.length > 0 && (
          <ul className="cost-list bill-list" aria-label={t('ledger.list')}>
            {flat.map((record) => renderBill(record, true))}
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
