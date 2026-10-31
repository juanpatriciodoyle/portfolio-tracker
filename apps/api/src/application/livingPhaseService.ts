import { randomUUID } from 'crypto';
import type {
  CalendarDate,
  CreateFixedCostRequest,
  CreateLivingPhaseRequest,
  LivingPhaseDto,
  PhaseComparisonResponse,
  TimelineResponse,
  UpdateFixedCostRequest,
  UpdateLivingPhaseRequest,
} from '../contracts';
import { PhaseOverlapError } from '../domain/errors';
import {
  buildTimeline,
  createFixedCost,
  createLivingPhase,
  findConflicts,
  findOverlaps,
  phaseSnapshot,
  type LivingPhase,
} from '../domain/livingPhase';
import { comparePhases } from '../domain/phaseComparison';
import { ResourceNotFoundError } from './errors';
import { PayloadVault } from './payloadVault';
import type { CipherContext, FieldCipher, LivingPhaseRepository, StoredLivingPhase } from './ports';
import { costPayloadSchema, phasePayloadSchema, type CostPayload, type PhasePayload } from './storedPayloads';

const phaseContext = (userId: string, phaseId: string): CipherContext => ({ table: 'LivingPhase', rowId: phaseId, userId });
const costContext = (userId: string, costId: string): CipherContext => ({ table: 'FixedCostItem', rowId: costId, userId });

export interface LivingPhaseServiceDeps {
  readonly repository: LivingPhaseRepository;
  readonly cipher: FieldCipher;
  /** Ids are made here (not by the database) because they are bound into each ciphertext. */
  readonly newId?: () => string;
}

interface LoadedPhase {
  readonly dto: LivingPhaseDto;
  readonly phase: LivingPhase;
}

/**
 * Orchestrates living phases: decrypts what is stored, hands the maths to the domain, and keeps
 * everything personal sealed on the way back in. Commands answer with ids only; queries return data.
 */
export class LivingPhaseService {
  private readonly repository: LivingPhaseRepository;
  private readonly vault: PayloadVault;
  private readonly newId: () => string;

  constructor({ repository, cipher, newId = () => randomUUID() }: LivingPhaseServiceDeps) {
    this.repository = repository;
    this.vault = new PayloadVault(cipher);
    this.newId = newId;
  }

  // ---- queries -------------------------------------------------------------------------------

  async listPhases(userId: string): Promise<LivingPhaseDto[]> {
    return (await this.loadAll(userId)).map(({ dto }) => dto);
  }

  async timeline(userId: string, asOf: CalendarDate): Promise<TimelineResponse> {
    const loaded = await this.loadAll(userId);
    const entries = buildTimeline(loaded.map(({ phase }) => phase), asOf).map((entry) => {
      const { dto } = loaded.find(({ phase }) => phase.id === entry.phaseId)!;
      return { ...entry, name: dto.name, city: dto.city, countryCode: dto.countryCode };
    });
    return { asOf, entries };
  }

  /** Changes from `fromPhaseId` to `toPhaseId`. Phases in different currencies need exchange rates first. */
  async compare(userId: string, fromPhaseId: string, toPhaseId: string): Promise<PhaseComparisonResponse> {
    const loaded = await this.loadAll(userId);
    const from = loaded.find(({ phase }) => phase.id === fromPhaseId);
    const to = loaded.find(({ phase }) => phase.id === toPhaseId);
    if (!from || !to) throw new ResourceNotFoundError('living phase');

    if (from.phase.currency !== to.phase.currency) {
      return { comparable: false, reason: 'FX_REQUIRED', currencies: [from.phase.currency, to.phase.currency] };
    }

    const result = comparePhases(phaseSnapshot(from.phase), phaseSnapshot(to.phase));
    return {
      comparable: true,
      fromPhaseId,
      toPhaseId,
      currency: result.currency,
      monthlyIncomeDeltaMinor: result.monthlyIncomeDeltaMinor,
      monthlyFixedCostsDeltaMinor: result.monthlyFixedCostsDeltaMinor,
      savingsCapacityDeltaMinor: result.savingsCapacityDeltaMinor,
      fixedCostsDeltaFraction: result.fixedCostsDeltaFraction,
      categories: [...result.categories],
    };
  }

  // ---- commands ------------------------------------------------------------------------------

  async createPhase(userId: string, request: CreateLivingPhaseRequest): Promise<{ id: string }> {
    const [stored] = await this.prepareNewPhases(userId, [request]);
    await this.repository.createMany(userId, [stored]);
    return { id: stored.id };
  }

  /** Saves a whole history at once: validated as a set, stored all-or-nothing. */
  async backfillPhases(userId: string, requests: readonly CreateLivingPhaseRequest[]): Promise<{ ids: string[] }> {
    const stored = await this.prepareNewPhases(userId, requests);
    await this.repository.createMany(userId, stored);
    return { ids: stored.map(({ id }) => id) };
  }

  async updatePhase(userId: string, phaseId: string, change: UpdateLivingPhaseRequest): Promise<void> {
    const all = await this.repository.list(userId);
    const stored = all.find(({ id }) => id === phaseId);
    if (!stored) throw new ResourceNotFoundError('living phase');

    const current = this.vault.open(phasePayloadSchema, stored.payload, phaseContext(userId, phaseId));
    const payload: PhasePayload = {
      name: change.name ?? current.name,
      city: change.city ?? current.city,
      address: change.address === undefined ? current.address : change.address,
      monthlyIncomeMinor: change.monthlyIncomeMinor ?? current.monthlyIncomeMinor,
      notes: change.notes === undefined ? current.notes : change.notes,
    };
    const columns = {
      startDate: change.startDate ?? stored.startDate,
      endDate: change.endDate === undefined ? stored.endDate : change.endDate,
      currency: change.currency ?? stored.currency,
      countryCode: change.countryCode ?? stored.countryCode,
      tenure: change.tenure ?? stored.tenure,
    };

    createLivingPhase({ id: phaseId, ...columns, monthlyIncomeMinor: payload.monthlyIncomeMinor, fixedCosts: [] });
    const conflicts = findConflicts({ id: phaseId, startDate: columns.startDate, endDate: columns.endDate }, all);
    if (conflicts.length > 0) throw new PhaseOverlapError(conflicts);

    const updated = await this.repository.update(userId, phaseId, {
      ...columns,
      payload: this.vault.seal(payload, phaseContext(userId, phaseId)),
    });
    if (!updated) throw new ResourceNotFoundError('living phase');
  }

  async deletePhase(userId: string, phaseId: string): Promise<void> {
    if (!(await this.repository.delete(userId, phaseId))) throw new ResourceNotFoundError('living phase');
  }

  async addFixedCost(userId: string, phaseId: string, request: CreateFixedCostRequest): Promise<{ id: string }> {
    const id = this.newId();
    createFixedCost({ id, category: request.category, cadence: request.cadence, amountMinor: request.amountMinor });
    const payload: CostPayload = {
      label: request.label ?? null,
      amountMinor: request.amountMinor,
      notes: request.notes ?? null,
    };

    const added = await this.repository.addFixedCost(userId, phaseId, {
      id,
      category: request.category,
      cadence: request.cadence,
      payload: this.vault.seal(payload, costContext(userId, id)),
    });
    if (!added) throw new ResourceNotFoundError('living phase');
    return { id };
  }

  async updateFixedCost(userId: string, phaseId: string, costId: string, change: UpdateFixedCostRequest): Promise<void> {
    const stored = await this.repository.find(userId, phaseId);
    if (!stored) throw new ResourceNotFoundError('living phase');
    const existing = stored.fixedCosts.find(({ id }) => id === costId);
    if (!existing) throw new ResourceNotFoundError('fixed cost');

    const current = this.vault.open(costPayloadSchema, existing.payload, costContext(userId, costId));
    const payload: CostPayload = {
      label: change.label === undefined ? current.label : change.label,
      amountMinor: change.amountMinor ?? current.amountMinor,
      notes: change.notes === undefined ? current.notes : change.notes,
    };
    const category = change.category ?? existing.category;
    const cadence = change.cadence ?? existing.cadence;
    createFixedCost({ id: costId, category, cadence, amountMinor: payload.amountMinor });

    const updated = await this.repository.updateFixedCost(userId, phaseId, costId, {
      category,
      cadence,
      payload: this.vault.seal(payload, costContext(userId, costId)),
    });
    if (!updated) throw new ResourceNotFoundError('fixed cost');
  }

  async deleteFixedCost(userId: string, phaseId: string, costId: string): Promise<void> {
    if (!(await this.repository.deleteFixedCost(userId, phaseId, costId))) {
      throw new ResourceNotFoundError('fixed cost');
    }
  }

  // ---- internals -----------------------------------------------------------------------------

  private async loadAll(userId: string): Promise<LoadedPhase[]> {
    return (await this.repository.list(userId)).map((stored) => {
      const dto = this.toDto(userId, stored);
      const phase = createLivingPhase({
        id: dto.id,
        startDate: dto.startDate,
        endDate: dto.endDate,
        currency: dto.currency,
        monthlyIncomeMinor: dto.monthlyIncomeMinor,
        fixedCosts: dto.fixedCosts.map(({ id, category, cadence, amountMinor }) => ({ id, category, cadence, amountMinor })),
      });
      return { dto, phase };
    });
  }

  private toDto(userId: string, stored: StoredLivingPhase): LivingPhaseDto {
    const payload = this.vault.open(phasePayloadSchema, stored.payload, phaseContext(userId, stored.id));
    return {
      id: stored.id,
      name: payload.name,
      city: payload.city,
      address: payload.address,
      countryCode: stored.countryCode,
      tenure: stored.tenure,
      startDate: stored.startDate,
      endDate: stored.endDate,
      currency: stored.currency,
      monthlyIncomeMinor: payload.monthlyIncomeMinor,
      notes: payload.notes,
      fixedCosts: stored.fixedCosts.map((cost) => {
        const sealed = this.vault.open(costPayloadSchema, cost.payload, costContext(userId, cost.id));
        return {
          id: cost.id,
          category: cost.category,
          cadence: cost.cadence,
          amountMinor: sealed.amountMinor,
          label: sealed.label,
          notes: sealed.notes,
        };
      }),
    };
  }

  /** Checks the new phases against each other and against what exists, then seals them for storage. */
  private async prepareNewPhases(userId: string, requests: readonly CreateLivingPhaseRequest[]): Promise<StoredLivingPhase[]> {
    const existing = await this.repository.list(userId);
    const drafts = requests.map((request) => ({
      request,
      id: this.newId(),
      costs: request.fixedCosts.map((cost) => ({ ...cost, id: this.newId() })),
    }));

    const phases = drafts.map(({ request, id, costs }) =>
      createLivingPhase({
        id,
        startDate: request.startDate,
        endDate: request.endDate,
        currency: request.currency,
        monthlyIncomeMinor: request.monthlyIncomeMinor,
        fixedCosts: costs.map(({ id: costId, category, cadence, amountMinor }) => ({ id: costId, category, cadence, amountMinor })),
      })
    );

    const conflicts = new Set<string>();
    for (const phase of phases) findConflicts(phase, existing).forEach((id) => conflicts.add(id));
    for (const [first, second] of findOverlaps(phases)) {
      conflicts.add(first);
      conflicts.add(second);
    }
    if (conflicts.size > 0) throw new PhaseOverlapError([...conflicts]);

    return drafts.map(({ request, id, costs }) => ({
      id,
      startDate: request.startDate,
      endDate: request.endDate,
      currency: request.currency,
      countryCode: request.countryCode,
      tenure: request.tenure,
      payload: this.vault.seal(
        {
          name: request.name,
          city: request.city,
          address: request.address ?? null,
          monthlyIncomeMinor: request.monthlyIncomeMinor,
          notes: request.notes ?? null,
        } satisfies PhasePayload,
        phaseContext(userId, id)
      ),
      fixedCosts: costs.map((cost) => ({
        id: cost.id,
        category: cost.category,
        cadence: cost.cadence,
        payload: this.vault.seal(
          { label: cost.label ?? null, amountMinor: cost.amountMinor, notes: cost.notes ?? null } satisfies CostPayload,
          costContext(userId, cost.id)
        ),
      })),
    }));
  }
}
