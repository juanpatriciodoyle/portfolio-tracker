import type {
  BillingRecordRepository,
  LivingPhaseRepository,
  ProfileRepository,
  StoredBillingRecord,
  StoredBillingRecordChange,
  StoredCostChange,
  StoredFixedCost,
  StoredLivingPhase,
  StoredPhaseChange,
  StoredProfile,
} from '../../application/ports';

interface Row {
  readonly userId: string;
  phase: StoredLivingPhase;
}

const copy = <T>(value: T): T => structuredClone(value);

/** A fast stand-in for the database that follows the same contract as the Prisma repository. */
export class InMemoryLivingPhaseRepository implements LivingPhaseRepository {
  private readonly rows = new Map<string, Row>();

  /** Everything that is stored, so tests can assert what is (not) readable in the database. */
  dump(): unknown {
    return copy([...this.rows.values()]);
  }

  /** Simulates a damaged or hand-edited row. */
  corruptPayload(phaseId: string): void {
    const row = this.rows.get(phaseId);
    if (row) row.phase = { ...row.phase, payload: 'v1:AAAA:AAAA:AAAA' };
  }

  async list(userId: string): Promise<StoredLivingPhase[]> {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .map((row) => copy(row.phase))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  }

  async find(userId: string, phaseId: string): Promise<StoredLivingPhase | null> {
    const row = this.owned(userId, phaseId);
    return row ? copy(row.phase) : null;
  }

  async createMany(userId: string, phases: readonly StoredLivingPhase[]): Promise<void> {
    const ids = phases.map((phase) => phase.id);
    if (new Set(ids).size !== ids.length || ids.some((id) => this.rows.has(id))) {
      throw new Error('Duplicate living phase id');
    }
    for (const phase of phases) this.rows.set(phase.id, { userId, phase: copy(phase) });
  }

  async update(userId: string, phaseId: string, change: StoredPhaseChange): Promise<boolean> {
    const row = this.owned(userId, phaseId);
    if (!row) return false;
    const defined = Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined));
    row.phase = { ...row.phase, ...defined };
    return true;
  }

  async delete(userId: string, phaseId: string): Promise<boolean> {
    return this.owned(userId, phaseId) ? this.rows.delete(phaseId) : false;
  }

  async addFixedCost(userId: string, phaseId: string, cost: StoredFixedCost): Promise<boolean> {
    const row = this.owned(userId, phaseId);
    if (!row) return false;
    row.phase = { ...row.phase, fixedCosts: [...row.phase.fixedCosts, copy(cost)] };
    return true;
  }

  async updateFixedCost(userId: string, phaseId: string, costId: string, change: StoredCostChange): Promise<boolean> {
    const row = this.owned(userId, phaseId);
    if (!row || !row.phase.fixedCosts.some((cost) => cost.id === costId)) return false;
    const defined = Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined));
    row.phase = {
      ...row.phase,
      fixedCosts: row.phase.fixedCosts.map((cost) => (cost.id === costId ? { ...cost, ...defined } : cost)),
    };
    return true;
  }

  async deleteFixedCost(userId: string, phaseId: string, costId: string): Promise<boolean> {
    const row = this.owned(userId, phaseId);
    if (!row || !row.phase.fixedCosts.some((cost) => cost.id === costId)) return false;
    row.phase = { ...row.phase, fixedCosts: row.phase.fixedCosts.filter((cost) => cost.id !== costId) };
    return true;
  }

  private owned(userId: string, phaseId: string): Row | undefined {
    const row = this.rows.get(phaseId);
    return row && row.userId === userId ? row : undefined;
  }
}

export class InMemoryProfileRepository implements ProfileRepository {
  private readonly profiles = new Map<string, StoredProfile>();

  dump(): unknown {
    return copy([...this.profiles.entries()]);
  }

  async find(userId: string): Promise<StoredProfile | null> {
    const profile = this.profiles.get(userId);
    return profile ? copy(profile) : null;
  }

  async save(userId: string, payload: string): Promise<void> {
    this.profiles.set(userId, { payload });
  }
}

/** Bills in memory. A bill whose phase is gone (or belongs to someone else) simply does not exist, like the database cascade. */
export class InMemoryBillingRecordRepository implements BillingRecordRepository {
  private readonly rows = new Map<string, { userId: string; record: StoredBillingRecord }>();

  constructor(private readonly phases: InMemoryLivingPhaseRepository) {}

  dump(): unknown {
    return copy([...this.rows.values()]);
  }

  corruptPayload(recordId: string): void {
    const row = this.rows.get(recordId);
    if (row) row.record = { ...row.record, payload: 'v1:AAAA:AAAA:AAAA' };
  }

  async list(userId: string, filter: { phaseId?: string } = {}): Promise<StoredBillingRecord[]> {
    const alive: StoredBillingRecord[] = [];
    for (const row of this.rows.values()) {
      if (row.userId !== userId) continue;
      if (filter.phaseId !== undefined && row.record.phaseId !== filter.phaseId) continue;
      if (await this.phases.find(userId, row.record.phaseId)) alive.push(copy(row.record));
    }
    return alive.sort((a, b) => b.periodStart.localeCompare(a.periodStart) || a.id.localeCompare(b.id));
  }

  async find(userId: string, recordId: string): Promise<StoredBillingRecord | null> {
    const row = this.rows.get(recordId);
    if (!row || row.userId !== userId || !(await this.phases.find(userId, row.record.phaseId))) return null;
    return copy(row.record);
  }

  async create(userId: string, record: StoredBillingRecord): Promise<boolean> {
    if (!(await this.phases.find(userId, record.phaseId))) return false;
    if (this.rows.has(record.id)) throw new Error('Duplicate billing record id');
    this.rows.set(record.id, { userId, record: copy(record) });
    return true;
  }

  async update(userId: string, recordId: string, change: StoredBillingRecordChange): Promise<boolean> {
    const row = this.rows.get(recordId);
    if (!row || !(await this.find(userId, recordId))) return false;
    const defined = Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined));
    row.record = { ...row.record, ...defined };
    return true;
  }

  async delete(userId: string, recordId: string): Promise<boolean> {
    return (await this.find(userId, recordId)) ? this.rows.delete(recordId) : false;
  }
}
