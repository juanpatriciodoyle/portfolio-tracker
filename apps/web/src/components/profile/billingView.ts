import type {
  BillingRecordDto,
  CreateBillingRecordRequest,
  PhaseObservedDto,
  UpdateBillingRecordRequest,
} from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';

/** What a phase card needs to show and change the bills of its phase, bundled so it travels as one prop. */
export interface BillingView {
  /** Today as the server sees it; the "Log a bill" form starts with the month before. */
  asOf: string | null;
  recordsFor: (phaseId: string) => readonly BillingRecordDto[];
  observedFor: (phaseId: string) => PhaseObservedDto | undefined;
  onAdd: (input: CreateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  onUpdate: (recordId: string, input: UpdateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  onDelete: (recordId: string) => Promise<MutationResult<unknown>>;
}
