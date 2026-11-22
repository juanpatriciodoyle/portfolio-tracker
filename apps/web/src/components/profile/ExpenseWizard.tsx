import { useTranslation } from '../../i18n/useTranslation';
import { useEffect, useState } from 'react';
import type { CreateBillingRecordRequest, CreateFixedCostRequest, LivingPhaseDto } from '../../contracts';
import { useDocumentExtraction } from '../../hooks/useDocumentExtraction';
import type { MutationResult } from '../../lib/apiErrors';
import { defaultExpensePhase } from '../../lib/phaseRouting';
import Modal from '../Modal';
import WizardModal from '../wizard/WizardModal';
import type { BillFormContext } from './billForm';
import { describeDocumentFailure } from './describeDocument';
import { blankFields } from './documentForm';
import { emptyExpenseForm, expenseFormFromDraft } from './expenseForm';
import ExpenseSteps, { type ExpenseStepsProps } from './ExpenseSteps';
import PdfPicker from './PdfPicker';

interface ExpenseWizardProps {
  /** Every home: a bill goes to the one its days fall in. */
  phases: readonly LivingPhaseDto[];
  context: BillFormContext;
  /** PDFs already chosen elsewhere (such as a home's bills): the wizard opens straight on the first one. */
  initialFiles?: readonly File[];
  /** The home a PDF is suggested for when its days point nowhere. */
  openedFromPhaseId?: string;
  /** A bill that arrived, with the days it covers. */
  onSubmitReceipt: (input: CreateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  /** What something costs every so often, with no days. */
  onSubmitRate: (phase: LivingPhaseDto, input: CreateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onClose: () => void;
}

/** A browser-held copy of the file for the preview, released as soon as the wizard moves on. */
function usePreviewUrl(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file]);
  return url;
}

type PdfBillProps = Pick<ExpenseStepsProps, 'phases' | 'context' | 'onSubmitReceipt' | 'onSubmitRate' | 'onClose'> & {
  file: File;
  openedFromPhaseId: string;
  title: string;
  progress: string | undefined;
  hasNext: boolean;
  /** The bill was logged, or skipped: on to the next PDF, or done. */
  onNext: () => void;
};

/** One PDF: it is read, then the same questions are asked with its answers filled in and its pages beside them. */
function PdfBill({ file, phases, context, openedFromPhaseId, title, progress, hasNext, onNext, onSubmitReceipt, onSubmitRate, onClose }: PdfBillProps) {
  const words = useTranslation();
  const { t } = words;
  const previewUrl = usePreviewUrl(file);
  const extraction = useDocumentExtraction(file, openedFromPhaseId);
  const result = extraction.result;
  const suggested = phases.find((phase) => phase.id === result?.suggestedPhaseId) ?? phases.find((phase) => phase.id === openedFromPhaseId) ?? phases[0];
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const phase = phases.find((candidate) => candidate.id === (phaseId ?? suggested.id)) ?? suggested;

  if (extraction.status === 'reading') {
    return (
      <Modal label={title} onClose={onClose}>
        <p className="document-review__notice" role="status">
          {t('pdf.reading')}
        </p>
        {progress && <p className="document-review__progress">{progress}</p>}
      </Modal>
    );
  }

  if (extraction.status === 'failed' || !result) {
    return (
      <Modal label={title} onClose={onClose}>
        <p className="form-error-text" role="alert">
          {extraction.failure ? describeDocumentFailure(extraction.failure, words) : t('pdf.couldNotRead')}
        </p>
        <div className="cost-editor__actions">
          <button type="button" className="btn-primary-apply" onClick={extraction.retry}>
            {t('common.tryAgain')}
          </button>
          {hasNext && (
            <button type="button" className="btn-secondary-cancel" onClick={onNext}>
              {t('expense.skip')}
            </button>
          )}
          <button type="button" className="btn-secondary-cancel" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </Modal>
    );
  }

  const { draft, textFound } = result;
  const currencyDiffers = draft.currency !== null && draft.currency !== phase.currency;

  return (
    <ExpenseSteps
      // Each PDF starts with its own answers.
      key={file.name + file.size + file.lastModified}
      initial={expenseFormFromDraft(draft, phase.currency, { ...context, countryCode: phase.countryCode })}
      blanks={blankFields(draft)}
      phases={phases}
      context={{ ...context, countryCode: phase.countryCode }}
      hasStartStep={false}
      chosenPhaseId={phases.length > 1 ? phase.id : null}
      title={title}
      progress={progress}
      onSkip={hasNext ? onNext : undefined}
      preview={
        previewUrl ? (
          <object className="document-review__preview" data={previewUrl} type="application/pdf" aria-label={t('pdf.preview')}>
            <p className="document-review__notice">{t('pdf.noPreview')}</p>
          </object>
        ) : (
          <p className="document-review__notice">{t('pdf.preparing')}</p>
        )
      }
      notices={
        <>
          {!textFound && (
            <p className="document-review__notice" role="status">
              {t('pdf.noText')}
            </p>
          )}
          {phases.length > 1 && (
            <div className="form-group">
              <label className="form-label" htmlFor="expense-wizard-phase">
                {t('pdf.whichHome')}
              </label>
              <select id="expense-wizard-phase" className="form-input" value={phase.id} onChange={(event) => setPhaseId(event.target.value)}>
                {phases.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.currency})
                  </option>
                ))}
              </select>
            </div>
          )}
          {currencyDiffers && (
            <p className="document-review__notice is-warning" role="alert">
              {t('pdf.currencyDiffers', { billCurrency: draft.currency ?? '', phase: phase.name, phaseCurrency: phase.currency })}
            </p>
          )}
        </>
      }
      onSubmitReceipt={onSubmitReceipt}
      onSubmitRate={onSubmitRate}
      onSaved={onNext}
      onClose={onClose}
    />
  );
}

/**
 * The one way to add an expense. It starts by asking how (drop PDFs, or type it in) and then asks a few plain
 * questions, one step at a time. How it is stored (a bill that arrived, or what something costs every so often)
 * follows from the answers.
 */
export default function ExpenseWizard({ phases, context, initialFiles = [], openedFromPhaseId, onSubmitReceipt, onSubmitRate, onClose }: ExpenseWizardProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<readonly File[]>(initialFiles);
  const [manual, setManual] = useState(false);
  const [index, setIndex] = useState(0);
  const fallbackPhase = defaultExpensePhase(phases, context.today ?? '') ?? phases[0];

  if (files.length > 0) {
    const file = files[index];
    const hasNext = index < files.length - 1;
    return (
      <PdfBill
        key={index}
        file={file}
        phases={phases}
        context={context}
        openedFromPhaseId={openedFromPhaseId ?? fallbackPhase.id}
        title={files.length > 1 ? t('pdf.titleMany') : t('pdf.titleOne')}
        progress={files.length > 1 ? t('pdf.progress', { n: index + 1, total: files.length, name: file.name }) : undefined}
        hasNext={hasNext}
        onNext={() => (hasNext ? setIndex(index + 1) : onClose())}
        onSubmitReceipt={onSubmitReceipt}
        onSubmitRate={onSubmitRate}
        onClose={onClose}
      />
    );
  }

  if (manual) {
    return (
      <ExpenseSteps
        initial={emptyExpenseForm()}
        phases={phases}
        context={context}
        hasStartStep
        onBackFromFirst={() => setManual(false)}
        onSubmitReceipt={onSubmitReceipt}
        onSubmitRate={onSubmitRate}
        onSaved={onClose}
        onClose={onClose}
      />
    );
  }

  return (
    <WizardModal
      title={t('bill.addExpense')}
      steps={[
        { id: 'start', label: t('expense.step.start') },
        { id: 'who', label: t('expense.step.who') },
        { id: 'amount', label: t('expense.step.amount') },
        { id: 'dates', label: t('expense.step.dates') },
      ]}
      stepIndex={0}
      heading={t('expenseWizard.how')}
      hideNext
      finishLabel={t('common.continue')}
      onBack={onClose}
      onNext={() => setManual(true)}
      onClose={onClose}
    >
      <PdfPicker large onFiles={setFiles} />
      <button type="button" className="btn-secondary-cancel expense-wizard__manual" onClick={() => setManual(true)}>
        {t('expenseWizard.manual')}
      </button>
    </WizardModal>
  );
}
