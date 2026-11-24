import type { PrismaClient } from '@prisma/client';
import type { LedgerAmendment, PortfolioOwner, PortfolioRepository, StoredPosition, StoredRealizedGain, StoredTransaction } from '../application/ports';
import type { PositionChange, TransactionPlan } from '../domain/transactionPlan';

/**
 * The portfolio as plain tables (positions, transactions, realized gains). Cash is not stored here: it is replayed from the transactions.
 * The phase that encrypts these rows only changes this adapter.
 */
export class PrismaPortfolioRepository implements PortfolioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  owner(userId: string): Promise<PortfolioOwner | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, country: true, baseCurrency: true } });
  }

  transactions(userId: string): Promise<StoredTransaction[]> {
    return this.prisma.transaction.findMany({ where: { userId }, orderBy: { date: 'asc' } });
  }

  positions(userId: string): Promise<StoredPosition[]> {
    return this.prisma.position.findMany({ where: { userId } });
  }

  realizedGains(userId: string): Promise<StoredRealizedGain[]> {
    return this.prisma.realizedGain.findMany({ where: { userId }, orderBy: { date: 'desc' } });
  }

  findPosition(userId: string, symbol: string): Promise<StoredPosition | null> {
    return this.prisma.position.findFirst({ where: { userId, symbol: symbol.toUpperCase() } });
  }

  record(userId: string, plan: TransactionPlan): Promise<StoredTransaction> {
    const { transaction, position, realizedGain } = plan;
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.transaction.create({
        data: {
          userId,
          type: transaction.type,
          symbol: transaction.symbol,
          name: transaction.name,
          assetClass: transaction.assetClass,
          region: transaction.region,
          sector: transaction.sector,
          quantity: transaction.quantity,
          amount: transaction.amount,
          totalAmount: transaction.totalAmount,
          fee: transaction.fee,
          currency: transaction.currency,
          notes: transaction.notes,
          date: transaction.date,
          paidWithCash: transaction.paidWithCash,
        },
      });
      if (position) await applyPositionChange(tx, userId, position);
      if (realizedGain) await tx.realizedGain.create({ data: { userId, ...realizedGain } });
      return saved;
    });
  }

  amend(userId: string, amendment: LedgerAmendment): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Both writes are scoped to the owner: another person's transaction is simply not found.
      const touched =
        amendment.kind === 'delete'
          ? await tx.transaction.deleteMany({ where: { id: amendment.id, userId } })
          : await tx.transaction.updateMany({ where: { id: amendment.id, userId }, data: amendment.data });
      if (touched.count !== 1) return false;

      const { instrument } = amendment;
      if (!instrument) return true;
      const held = await tx.position.findMany({ where: { userId, symbol: instrument.symbol }, orderBy: { createdAt: 'asc' } });
      const [keep, ...extra] = held;
      if (extra.length > 0) await tx.position.deleteMany({ where: { id: { in: extra.map((position) => position.id) } } });
      if (!instrument.position) {
        if (keep) await tx.position.delete({ where: { id: keep.id } });
      } else if (keep) {
        const { name, assetClass, region, sector, quantity, investedAmount, createdAt } = instrument.position;
        await tx.position.update({ where: { id: keep.id }, data: { name, assetClass, region, sector, quantity, investedAmount, createdAt } });
      } else {
        await tx.position.create({ data: { userId, ...instrument.position } });
      }

      await tx.realizedGain.deleteMany({ where: { userId, symbol: instrument.symbol } });
      if (instrument.gains.length > 0) await tx.realizedGain.createMany({ data: instrument.gains.map((gain) => ({ userId, ...gain })) });
      return true;
    });
  }

  async usersWithTransactions(): Promise<string[]> {
    // Demo guests live for an hour and belong to nobody: no history is kept for them.
    const rows = await this.prisma.transaction.findMany({ where: { userId: { not: null }, user: { isGuest: false } }, distinct: ['userId'], select: { userId: true } });
    return rows.flatMap((row) => (row.userId === null ? [] : [row.userId]));
  }
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

async function applyPositionChange(tx: Tx, userId: string, change: PositionChange): Promise<void> {
  switch (change.kind) {
    case 'open':
      await tx.position.create({ data: { userId, ...change.data } });
      return;
    case 'grow':
    case 'shrink':
      await tx.position.update({ where: { id: change.id }, data: { quantity: change.quantity, investedAmount: change.investedAmount } });
      return;
    case 'close':
      await tx.position.delete({ where: { id: change.id } });
      return;
  }
}
