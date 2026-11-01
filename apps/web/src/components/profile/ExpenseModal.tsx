import { useState } from 'react';
import {
  FIXED_COST_CATEGORIES,
  VARIABLE_COST_CATEGORIES,
  type CreateBillingRecordRequest,
  type CreateFixedCostRequest,
  type FixedCostCategory,
  type LivingPhaseDto,
} from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import Modal from '../Modal';
import BillEditor from './BillEditor';
import type { BillFormContext } from './billForm';
import FixedCostEditor from './FixedCostEditor';
import PdfPicker from './PdfPicker';
import SegmentedChoice from './SegmentedChoice';

type Kind = 'BILL' | 'RATE';

const KINDS: readonly { value: Kind; label: string }[] = [
  { value: 'BILL', label: 'Single bill receipt' },
  { value: 'RATE', label: 'Recurring fixed rate' },
];

/** What can be a fixed rate: everything except the categories whose bill changes every time. */
const FIXED_RATE_CATEGORIES: readonly FixedCostCategory[] = FIXED_COST_CATEGORIES.filter(
  (category) => !(VARIABLE_COST_CATEGORIES as readonly FixedCostCategory[]).includes(category)
);

interface ExpenseModalProps {
  phase: LivingPhaseDto;
  context: BillFormContext;
  /** A bill that arrived, with the days it covers. */
  onSubmit: (input: CreateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  /** A fixed contract or subscription: an amount and how often it is paid, with no bill period. */
  onSubmitRate: (input: CreateFixedCostRequest) => Promise<MutationResult<unknown>>;
  /** PDFs chosen here are read one by one in the review that opens instead of this dialog. */
  onPickPdfs: (files: File[]) => void;
  onClose: () => void;
}

/** The one way to add a cost to a home: a bill that arrived (typed or from PDFs), or a fixed rate that recurs. */
export default function ExpenseModal({ phase, context, onSubmit, onSubmitRate, onPickPdfs, onClose }: ExpenseModalProps) {
  const [kind, setKind] = useState<Kind>('BILL');

  return (
    <Modal label="Add an expense" onClose={onClose}>
      <div className="expense-modal">
        <div>
          <h2 className="dialog__title">Add an expense</h2>
          <p className="dialog__hint">For {phase.name}.</p>
        </div>

        <div>
          <SegmentedChoice name={`expense-kind-${phase.id}`} legend="What are you adding?" options={KINDS} value={kind} onChange={setKind} />
          <p className="dialog__hint">
            {kind === 'BILL'
              ? 'A bill you received. Electricity, gas, water, heating / cooling and taxes always go here: their monthly cost is the average of the bills.'
              : 'A fixed contract or subscription: rent, internet, phone, a subscription. Its monthly cost is this rate until bills you log later take over.'}
          </p>
        </div>

        {kind === 'BILL' ? (
          <>
            <PdfPicker onFiles={onPickPdfs} />
            <BillEditor phaseId={phase.id} currency={phase.currency} context={context} onSubmit={onSubmit} onCancel={onClose} />
          </>
        ) : (
          <FixedCostEditor
            currency={phase.currency}
            categories={FIXED_RATE_CATEGORIES}
            suggestion={{ countryCode: context.countryCode, history: context.history }}
            submitLabel="Add recurring cost"
            onSubmit={onSubmitRate}
            onCancel={onClose}
          />
        )}
      </div>
    </Modal>
  );
}
