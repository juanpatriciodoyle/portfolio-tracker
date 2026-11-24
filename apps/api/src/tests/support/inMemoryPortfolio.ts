import type { InflationRates, LedgerAmendment, PortfolioOwner, PortfolioRepository, SnapshotRepository, StoredPosition, StoredRealizedGain, StoredTransaction } from '../../application/ports';
import type { PortfolioSnapshot } from '../../domain/portfolioSnapshots';
import type { TransactionPlan } from '../../domain/transactionPlan';

/** The portfolio tables of several people, in memory: what the Prisma repository does, without a database. */
export class InMemoryPortfolioRepository implements PortfolioRepository {
  private owners = new Map<string, PortfolioOwner>();
  private rows = new Map<string, { transactions: StoredTransaction[]; positions: StoredPosition[]; gains: StoredRealizedGain[] }>();
  private nextId = 1;

  addOwner(owner: PortfolioOwner): void {
    this.owners.set(owner.id, owner);
  }

  private of(userId: string) {
    let rows = this.rows.get(userId);
    if (!rows) this.rows.set(userId, (rows = { transactions: [], positions: [], gains: [] }));
    return rows;
  }

  async owner(userId: string) {
    return this.owners.get(userId) ?? null;
  }

  async transactions(userId: string) {
    return [...this.of(userId).transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async positions(userId: string) {
    return [...this.of(userId).positions];
  }

  async realizedGains(userId: string) {
    return [...this.of(userId).gains].sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async findPosition(userId: string, symbol: string) {
    return this.of(userId).positions.find((position) => position.symbol === symbol.toUpperCase()) ?? null;
  }

  async record(userId: string, plan: TransactionPlan): Promise<StoredTransaction> {
    const rows = this.of(userId);
    const saved: StoredTransaction = { id: `t${this.nextId++}`, ...plan.transaction, notes: plan.transaction.notes ?? null, createdAt: new Date(0) };
    rows.transactions.push(saved);

    const change = plan.position;
    if (change?.kind === 'open') rows.positions.push({ id: `p${this.nextId++}`, ...change.data });
    else if (change?.kind === 'grow' || change?.kind === 'shrink') {
      rows.positions = rows.positions.map((position) => (position.id === change.id ? { ...position, quantity: change.quantity, investedAmount: change.investedAmount } : position));
    } else if (change?.kind === 'close') rows.positions = rows.positions.filter((position) => position.id !== change.id);

    if (plan.realizedGain) rows.gains.push({ id: `g${this.nextId++}`, createdAt: rows.transactions[0]?.date ?? plan.realizedGain.date, ...plan.realizedGain });
    return saved;
  }

  async amend(userId: string, amendment: LedgerAmendment): Promise<boolean> {
    const rows = this.of(userId);
    const index = rows.transactions.findIndex((tx) => tx.id === amendment.id);
    if (index < 0) return false;

    if (amendment.kind === 'delete') rows.transactions.splice(index, 1);
    else rows.transactions[index] = { ...rows.transactions[index], ...amendment.data };

    const { instrument } = amendment;
    if (instrument) {
      const others = rows.positions.filter((position) => position.symbol !== instrument.symbol);
      const existing = rows.positions.find((position) => position.symbol === instrument.symbol);
      rows.positions = instrument.position ? [...others, { id: existing?.id ?? `p${this.nextId++}`, ...instrument.position }] : others;
      rows.gains = [
        ...rows.gains.filter((gain) => gain.symbol !== instrument.symbol),
        ...instrument.gains.map((gain) => ({ id: `g${this.nextId++}`, ...gain, createdAt: gain.createdAt ?? gain.date })),
      ];
    }
    return true;
  }

  async usersWithTransactions() {
    return [...this.rows.entries()].filter(([, rows]) => rows.transactions.length > 0).map(([userId]) => userId);
  }
}

export class InMemorySnapshotRepository implements SnapshotRepository {
  private readonly saved = new Map<string, PortfolioSnapshot>();
  saves = 0;

  async list(userId: string) {
    return [...this.saved.entries()].filter(([key]) => key.startsWith(`${userId}|`)).map(([, snapshot]) => snapshot);
  }

  async save(userId: string, snapshot: PortfolioSnapshot) {
    this.saves += 1;
    this.saved.set(`${userId}|${snapshot.day}`, snapshot);
  }

  async deleteFrom(userId: string, day: string) {
    for (const key of [...this.saved.keys()]) if (key.startsWith(`${userId}|`) && key.slice(userId.length + 1) >= day) this.saved.delete(key);
  }

  async saveMany(userId: string, snapshots: readonly PortfolioSnapshot[]) {
    for (const snapshot of snapshots) if (!this.saved.has(`${userId}|${snapshot.day}`)) this.saved.set(`${userId}|${snapshot.day}`, snapshot);
  }

  async has(userId: string, day: string) {
    return this.saved.has(`${userId}|${day}`);
  }
}

/** Prices rise by a flat percentage a year: enough for the figures to be predictable. */
export const flatInflation = (percent = 0): InflationRates => ({ sync: async () => undefined, between: async () => percent });
