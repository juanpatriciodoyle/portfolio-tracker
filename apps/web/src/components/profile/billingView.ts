import type {
  BenchmarksResponse,
  BillingRecordDto,
  LivingPhaseDto,
  CreateBillingRecordRequest,
  VendorHistoryEntry,
  UpdateBillingRecordRequest,
} from '../../contracts';
import type { LoadStatus, MutationResult } from '../../lib/apiErrors';

/** How each phase compares with its country, as the phase card needs it. */
export interface BenchmarksView {
  status: LoadStatus;
  message: string | null;
  benchmarks: BenchmarksResponse | null;
  onRetry: () => void;
  /** A phase's name from its id, for "1.59x what you had in Madrid". */
  nameOf: (phaseId: string) => string | undefined;
}

/** What a phase card needs to show and change the bills of its phase, bundled so it travels as one prop. */
export interface BillingView {
  /** Today as the server sees it: a cadence picked first fills in dates ending today. */
  asOf: string | null;
  /** Every living phase, so a bill read from a PDF can be assigned to the one its dates fall in. */
  phases?: readonly LivingPhaseDto[];
  recordsFor: (phaseId: string) => readonly BillingRecordDto[];
  /** The senders the person already declared or logged, newest first: it is how an expense's category is guessed. */
  history: readonly VendorHistoryEntry[];
  onAdd: (input: CreateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  onUpdate: (recordId: string, input: UpdateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  onDelete: (recordId: string) => Promise<MutationResult<unknown>>;
  /** Comparisons with the country; absent where they are not shown. */
  benchmarks?: BenchmarksView;
}
