import { useState } from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import type { CreateBillingRecordRequest, LivingPhaseDto, TimelineEntryDto } from '../../contracts';
import type { BillFormContext } from './billForm';
import BillsLedger from './BillsLedger';
import type { BillingView } from './billingView';
import ExpenseWizard from './ExpenseWizard';

interface PhaseBillsProps {
  phase: LivingPhaseDto;
  entry: TimelineEntryDto | undefined;
  billing: BillingView;
  /** Whether the costs and bills of this home are open. */
  open: boolean;
  onClose: () => void;
  announce: (message: string) => void;
}

/** The costs and bills of one home, and the PDF wizard they lead to. One place for every home, current or past. */
export default function PhaseBills({ phase, entry, billing, open, onClose, announce }: PhaseBillsProps) {
  const { t } = useTranslation();
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const context: BillFormContext = { today: billing.asOf, countryCode: phase.countryCode, history: billing.history };

  const saveFromDocument = async (input: CreateBillingRecordRequest) => {
    const result = await billing.onAdd(input);
    if (result.ok) announce(t('details.billLogged'));
    return result;
  };

  const pickPdfs = (files: File[]) => {
    onClose();
    setPdfFiles(files);
  };

  return (
    <>
      {open && (
        <BillsLedger
          phase={phase}
          entry={entry}
          records={billing.recordsFor(phase.id)}
          context={context}
          onUpdate={billing.onUpdate}
          onDelete={billing.onDelete}
          onPickPdfs={pickPdfs}
          onClose={onClose}
          announce={announce}
        />
      )}
      {pdfFiles.length > 0 && (
        <ExpenseWizard
          initialFiles={pdfFiles}
          phases={billing.phases ?? [phase]}
          context={context}
          openedFromPhaseId={phase.id}
          onSubmitReceipt={saveFromDocument}
          // PDFs are always bills that arrived: nothing here is stored as a rate.
          onSubmitRate={async () => ({ ok: false as const, failure: { kind: 'unknown' as const, message: t('details.noRateFromPdf') } })}
          onClose={() => setPdfFiles([])}
        />
      )}
    </>
  );
}
