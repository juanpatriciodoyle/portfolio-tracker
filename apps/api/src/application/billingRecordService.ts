import { randomUUID } from 'crypto';
import type {
  BillingRecordDto,
  CalendarDate,
  CreateBillingRecordRequest,
  ListBillingRecordsResponse,
  TrendsResponse,
  UpdateBillingRecordRequest,
} from '../contracts';
import { createBillingRecord, type BillingRecord } from '../domain/billing';
import { billIdentity } from '../domain/billIdentity';
import { DuplicateBillingRecordError } from '../domain/errors';
import { buildTrends } from '../domain/trends';
import { billingRecordContext } from './billedCosts';
import { ResourceNotFoundError } from './errors';
import type { LivingPhaseService } from './livingPhaseService';
import { PayloadVault } from './payloadVault';
import type { BillFingerprinter, BillingRecordRepository, FieldCipher, StoredBillingRecord } from './ports';
import { billingPayloadSchema, type BillingPayload } from './storedPayloads';

const recordContext = billingRecordContext;

export interface BillingRecordServiceDeps {
  readonly repository: BillingRecordRepository;
  readonly phases: LivingPhaseService;
  readonly cipher: FieldCipher;
  readonly fingerprinter: BillFingerprinter;
  readonly newId?: () => string;
}

/** Bills actually received, and the rolling-average trends built from them. Everything personal stays sealed. */
export class BillingRecordService {
  private readonly repository: BillingRecordRepository;
  private readonly phases: LivingPhaseService;
  private readonly vault: PayloadVault;
  private readonly fingerprinter: BillFingerprinter;
  private readonly newId: () => string;

  constructor({ repository, phases, cipher, fingerprinter, newId = () => randomUUID() }: BillingRecordServiceDeps) {
    this.repository = repository;
    this.phases = phases;
    this.vault = new PayloadVault(cipher);
    this.fingerprinter = fingerprinter;
    this.newId = newId;
  }

  // ---- queries -------------------------------------------------------------------------------

  async listRecords(userId: string, filter: { phaseId?: string } = {}): Promise<ListBillingRecordsResponse> {
    const [stored, phases] = await Promise.all([this.repository.list(userId, filter), this.phases.loadPhases(userId)]);
    const currencyOf = new Map(phases.map(({ phase }) => [phase.id, phase.currency]));
    return { records: stored.map((record) => this.toDto(userId, record, currencyOf.get(record.phaseId) as string)) };
  }

  /** Rolling averages of what the bills really cost, per currency, and what each phase's bills say against what was declared. */
  async trends(userId: string, asOf: CalendarDate): Promise<TrendsResponse> {
    const [stored, phases] = await Promise.all([this.repository.list(userId), this.phases.loadPhases(userId)]);
    const records = stored.map((record): BillingRecord => ({
      id: record.id,
      phaseId: record.phaseId,
      category: record.category,
      cadence: record.cadence,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
      amountMinor: this.vault.open(billingPayloadSchema, record.payload, recordContext(userId, record.id)).amountMinor,
    }));

    const trends = buildTrends({ records, phases: phases.map(({ phase }) => phase), asOf });
    const nameOf = new Map(phases.map(({ dto }) => [dto.id, dto.name]));
    return {
      asOf,
      lastCompleteMonth: trends.lastCompleteMonth,
      fixedCosts: trends.fixedCosts.map((group) => ({ ...group, windows: [...group.windows] })),
      subscriptions: trends.subscriptions.map((group) => ({ ...group, windows: [...group.windows] })),
      phases: trends.phases.map((phase) => ({ ...phase, name: nameOf.get(phase.phaseId) as string })),
    };
  }

  // ---- commands ------------------------------------------------------------------------------

  async createRecord(userId: string, request: CreateBillingRecordRequest): Promise<{ id: string }> {
    const id = this.newId();
    createBillingRecord({ id, ...pickBillingFields(request) });
    const payload: BillingPayload = { vendor: request.vendor, amountMinor: request.amountMinor, notes: request.notes ?? null };

    const fingerprint = this.fingerprintOf(userId, { ...pickBillingFields(request), vendor: request.vendor });
    const created = await this.repository.create(userId, {
      id,
      phaseId: request.phaseId,
      category: request.category,
      cadence: request.cadence,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      payload: this.vault.seal(payload, recordContext(userId, id)),
      fingerprint,
    });
    if (created === 'phase-missing') throw new ResourceNotFoundError('living phase');
    if (created === 'duplicate') throw await this.duplicateOf(userId, fingerprint);
    return { id };
  }

  async updateRecord(userId: string, recordId: string, change: UpdateBillingRecordRequest): Promise<void> {
    const stored = await this.repository.find(userId, recordId);
    if (!stored) throw new ResourceNotFoundError('bill');

    const current = this.vault.open(billingPayloadSchema, stored.payload, recordContext(userId, recordId));
    const payload: BillingPayload = {
      vendor: change.vendor ?? current.vendor,
      amountMinor: change.amountMinor ?? current.amountMinor,
      notes: change.notes === undefined ? current.notes : change.notes,
    };
    const fields = {
      category: change.category ?? stored.category,
      cadence: change.cadence ?? stored.cadence,
      periodStart: change.periodStart ?? stored.periodStart,
      periodEnd: change.periodEnd ?? stored.periodEnd,
    };
    createBillingRecord({ id: recordId, phaseId: stored.phaseId, amountMinor: payload.amountMinor, ...fields });

    const fingerprint = this.fingerprintOf(userId, { ...fields, phaseId: stored.phaseId, amountMinor: payload.amountMinor, vendor: payload.vendor });
    const updated = await this.repository.update(userId, recordId, {
      ...fields,
      payload: this.vault.seal(payload, recordContext(userId, recordId)),
      fingerprint,
    });
    if (updated === 'missing') throw new ResourceNotFoundError('bill');
    if (updated === 'duplicate') throw await this.duplicateOf(userId, fingerprint);
  }

  async deleteRecord(userId: string, recordId: string): Promise<void> {
    if (!(await this.repository.delete(userId, recordId))) throw new ResourceNotFoundError('bill');
  }

  // ---- internals -----------------------------------------------------------------------------

  private fingerprintOf(userId: string, parts: Parameters<typeof billIdentity>[0]): string {
    return this.fingerprinter.fingerprint(userId, billIdentity(parts));
  }

  private async duplicateOf(userId: string, fingerprint: string): Promise<DuplicateBillingRecordError> {
    return new DuplicateBillingRecordError((await this.repository.findIdByFingerprint(userId, fingerprint)) ?? '');
  }

  private toDto(userId: string, stored: StoredBillingRecord, currency: string): BillingRecordDto {
    const payload = this.vault.open(billingPayloadSchema, stored.payload, recordContext(userId, stored.id));
    return {
      id: stored.id,
      phaseId: stored.phaseId,
      category: stored.category,
      cadence: stored.cadence,
      periodStart: stored.periodStart,
      periodEnd: stored.periodEnd,
      amountMinor: payload.amountMinor,
      vendor: payload.vendor,
      notes: payload.notes,
      currency,
    };
  }
}

function pickBillingFields(request: CreateBillingRecordRequest) {
  return {
    phaseId: request.phaseId,
    category: request.category,
    cadence: request.cadence,
    periodStart: request.periodStart,
    periodEnd: request.periodEnd,
    amountMinor: request.amountMinor,
  };
}
