import { PrismaClient } from '@prisma/client';
import { PortfolioService } from '../application/portfolioService';
import type { PriceProvider } from '../application/ports';
import { amendedRow, rebuildInstrument } from '../domain/ledgerAmendment';
import { planTransaction, type TransactionCommand } from '../domain/transactionPlan';
import { PrismaPortfolioRepository } from '../infrastructure/prismaPortfolioRepository';
import { PrismaSnapshotRepository } from '../infrastructure/prismaSnapshotRepository';
import { flatInflation } from './support/inMemoryPortfolio';

/**
 * Runs against a real, disposable Postgres database (the migrations applied with `prisma migrate deploy`):
 *   TEST_DATABASE_URL=postgresql://... npm run test:integration
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  describe.skip('Prisma portfolio repositories (set TEST_DATABASE_URL to run)', () => {
    it('needs a disposable database', () => undefined);
  });
} else {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const portfolio = new PrismaPortfolioRepository(prisma);
  const snapshots = new PrismaSnapshotRepository(prisma);
  const createdUsers: string[] = [];

  const newUser = async (data: { isGuest?: boolean } = {}) => {
    const user = await prisma.user.create({ data: { email: `portfolio-${crypto.randomUUID()}@example.invalid`, ...data } });
    createdUsers.push(user.id);
    return user.id;
  };

  const command = (extra: Partial<TransactionCommand>): TransactionCommand => ({
    type: 'BOUGHT',
    symbol: 'AAPL',
    name: 'Apple',
    assetClass: 'Stock',
    region: 'North America',
    sector: 'Technology',
    quantity: 10,
    amount: 1000,
    fee: 2,
    currency: 'EUR',
    paidWithCash: false,
    date: new Date('2026-01-05T10:00:00Z'),
    ...extra,
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  });

  describe('PrismaPortfolioRepository', () => {
    it('saves a transaction with its paid-with-cash choice and opens the position', async () => {
      const userId = await newUser();

      const saved = await portfolio.record(userId, planTransaction(command({ paidWithCash: true }), null));

      expect(saved).toMatchObject({ type: 'BOUGHT', symbol: 'AAPL', amount: 1000, fee: 2, totalAmount: 1002, paidWithCash: true });
      expect((await portfolio.transactions(userId)).map((tx) => tx.paidWithCash)).toEqual([true]);
      expect(await portfolio.positions(userId)).toMatchObject([{ symbol: 'AAPL', quantity: 10, investedAmount: 1000 }]);
    });

    it('defaults a buy to new money', async () => {
      const userId = await newUser();
      await prisma.transaction.create({ data: { userId, type: 'BOUGHT', symbol: 'X', amount: 1, totalAmount: 1 } });

      expect((await portfolio.transactions(userId))[0].paidWithCash).toBe(false);
    });

    it('grows, shrinks and closes a position, and books the gain of a sale', async () => {
      const userId = await newUser();
      await portfolio.record(userId, planTransaction(command({}), null));
      await portfolio.record(userId, planTransaction(command({ quantity: 10, amount: 1200 }), await portfolio.findPosition(userId, 'aapl')));
      expect(await portfolio.findPosition(userId, 'aapl')).toMatchObject({ quantity: 20, investedAmount: 2200 });

      await portfolio.record(userId, planTransaction(command({ type: 'SOLD', quantity: 5, amount: 700, fee: 0 }), await portfolio.findPosition(userId, 'AAPL')));
      expect(await portfolio.findPosition(userId, 'AAPL')).toMatchObject({ quantity: 15, investedAmount: 1650 });
      expect(await portfolio.realizedGains(userId)).toMatchObject([{ symbol: 'AAPL', investedAmount: 550, realizedPnl: 150 }]);

      await portfolio.record(userId, planTransaction(command({ type: 'SOLD', quantity: 15, amount: 2000, fee: 0 }), await portfolio.findPosition(userId, 'AAPL')));
      expect(await portfolio.positions(userId)).toEqual([]);
    });

    it('saves all of a transaction or none of it', async () => {
      const userId = await newUser();
      const plan = planTransaction(command({}), { id: 'does-not-exist', quantity: 1, investedAmount: 1 });

      await expect(portfolio.record(userId, plan)).rejects.toBeDefined();

      expect(await portfolio.transactions(userId)).toEqual([]);
    });

    it('lists who has transactions, leaving out demo guests', async () => {
      const person = await newUser();
      const guest = await newUser({ isGuest: true });
      await portfolio.record(person, planTransaction(command({}), null));
      await portfolio.record(guest, planTransaction(command({}), null));

      const users = await portfolio.usersWithTransactions();

      expect(users).toContain(person);
      expect(users).not.toContain(guest);
    });

    describe('amend: a correction and the instrument rebuilt from the ledger, saved together', () => {
      const seeded = async () => {
        const userId = await newUser();
        await portfolio.record(userId, planTransaction(command({}), null));
        await portfolio.record(userId, planTransaction(command({ quantity: 5, amount: 700, date: new Date('2026-02-01T10:00:00Z') }), await portfolio.findPosition(userId, 'AAPL')));
        await portfolio.record(userId, planTransaction(command({ type: 'SOLD', quantity: 6, amount: 900, fee: 0, date: new Date('2026-03-01T10:00:00Z') }), await portfolio.findPosition(userId, 'AAPL')));
        return userId;
      };

      it('rewrites the transaction, the position and the gains of the instrument', async () => {
        const userId = await seeded();
        const ledger = await portfolio.transactions(userId);
        const next = amendedRow(ledger[1], { amount: 750 });

        const applied = await portfolio.amend(userId, {
          kind: 'update',
          id: next.id,
          data: { date: next.date, quantity: next.quantity, amount: next.amount, fee: next.fee, totalAmount: next.totalAmount, paidWithCash: next.paidWithCash, notes: next.notes ?? null },
          instrument: rebuildInstrument(ledger.map((row) => (row.id === next.id ? next : row)), 'AAPL'),
        });

        expect(applied).toBe(true);
        expect((await portfolio.transactions(userId))[1]).toMatchObject({ amount: 750, totalAmount: 752 });
        // 15 units cost 1,750; the 6 sold carried 700 of it away.
        expect(await portfolio.positions(userId)).toMatchObject([{ symbol: 'AAPL', quantity: 9, investedAmount: 1050 }]);
        expect(await portfolio.realizedGains(userId)).toMatchObject([{ investedAmount: 700, returnedAmount: 900, realizedPnl: 200 }]);
      });

      it('removes the transaction and the position and gains that only it explained', async () => {
        const userId = await newUser();
        await portfolio.record(userId, planTransaction(command({}), null));
        const [only] = await portfolio.transactions(userId);

        const applied = await portfolio.amend(userId, { kind: 'delete', id: only.id, instrument: rebuildInstrument([], 'AAPL') });

        expect(applied).toBe(true);
        expect(await portfolio.transactions(userId)).toEqual([]);
        expect(await portfolio.positions(userId)).toEqual([]);
      });

      it("answers false and changes nothing for a transaction that is not the person's", async () => {
        const alice = await seeded();
        const bob = await newUser();
        const [first] = await portfolio.transactions(alice);

        const applied = await portfolio.amend(bob, { kind: 'delete', id: first.id, instrument: rebuildInstrument([], 'AAPL') });

        expect(applied).toBe(false);
        expect(await portfolio.transactions(alice)).toHaveLength(3);
        expect(await portfolio.positions(alice)).toHaveLength(1);
      });

      it('leaves other instruments alone and keeps the position row when it only changes', async () => {
        const userId = await seeded();
        await portfolio.record(userId, planTransaction(command({ symbol: 'MSFT', name: 'Microsoft', quantity: 3, amount: 300 }), null));
        const before = await portfolio.findPosition(userId, 'AAPL');
        const ledger = await portfolio.transactions(userId);
        const sale = ledger.find((row) => row.type === 'SOLD')!;
        const next = amendedRow(sale, { quantity: 4 });

        await portfolio.amend(userId, {
          kind: 'update',
          id: next.id,
          data: { date: next.date, quantity: next.quantity, amount: next.amount, fee: next.fee, totalAmount: next.totalAmount, paidWithCash: next.paidWithCash, notes: next.notes ?? null },
          instrument: rebuildInstrument(ledger.map((row) => (row.id === next.id ? next : row)), 'AAPL'),
        });

        expect((await portfolio.findPosition(userId, 'AAPL'))?.id).toBe(before?.id);
        expect(await portfolio.findPosition(userId, 'AAPL')).toMatchObject({ quantity: 11 });
        expect(await portfolio.findPosition(userId, 'MSFT')).toMatchObject({ quantity: 3, investedAmount: 300 });
      });
    });

    it('never shows one person the rows of another', async () => {
      const alice = await newUser();
      const bob = await newUser();
      await portfolio.record(alice, planTransaction(command({}), null));

      expect(await portfolio.transactions(bob)).toEqual([]);
      expect(await portfolio.findPosition(bob, 'AAPL')).toBeNull();
    });
  });

  describe('PrismaSnapshotRepository', () => {
    const reading = (day: string, totalValue: number) => ({ day, currency: 'EUR', totalValue, holdingsValue: totalValue, cash: 0, moneyPutIn: 100, benchmarkPrice: null });

    it('keeps one reading a day, replacing the one already there', async () => {
      const userId = await newUser();

      await snapshots.save(userId, reading('2026-03-10', 1000));
      await snapshots.save(userId, reading('2026-03-10', 1100));
      await snapshots.save(userId, reading('2026-03-09', 900));

      expect((await snapshots.list(userId)).map((s) => [s.day, s.totalValue])).toEqual([
        ['2026-03-09', 900],
        ['2026-03-10', 1100],
      ]);
      expect(await snapshots.has(userId, '2026-03-10')).toBe(true);
      expect(await snapshots.has(userId, '2026-03-11')).toBe(false);
    });

    it('forgets the readings from a day onward, that day included, and only the readings of that person', async () => {
      const userId = await newUser();
      const other = await newUser();
      for (const day of ['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11']) await snapshots.save(userId, reading(day, 1));
      await snapshots.save(other, reading('2026-03-10', 5));

      await snapshots.deleteFrom(userId, '2026-03-10');

      expect((await snapshots.list(userId)).map((s) => s.day)).toEqual(['2026-03-08', '2026-03-09']);
      expect((await snapshots.list(other)).map((s) => s.day)).toEqual(['2026-03-10']);
    });

    it('round-trips the index price, present or absent', async () => {
      const userId = await newUser();
      await snapshots.save(userId, { ...reading('2026-03-10', 1), benchmarkPrice: 101.25 });
      await snapshots.save(userId, reading('2026-03-11', 1));

      expect((await snapshots.list(userId)).map((s) => s.benchmarkPrice)).toEqual([101.25, null]);
    });

    it('leaves out a reading it cannot read back instead of guessing', async () => {
      const userId = await newUser();
      await snapshots.save(userId, reading('2026-03-10', 1000));
      await prisma.portfolioSnapshot.create({ data: { userId, day: new Date('2026-03-11T00:00:00Z'), currency: 'EUR', values: { totalValue: 'lots' } } });

      expect((await snapshots.list(userId)).map((s) => s.day)).toEqual(['2026-03-10']);
    });

    it('disappears with the person', async () => {
      const userId = await newUser();
      await snapshots.save(userId, reading('2026-03-10', 1000));

      await prisma.user.delete({ where: { id: userId } });

      expect(await prisma.portfolioSnapshot.count({ where: { userId } })).toBe(0);
    });
  });

  describe('the portfolio use cases on the real tables', () => {
    it('records, values, and files today as the first real reading', async () => {
      const userId = await newUser();
      const prices: PriceProvider = { pricesFor: async () => new Map([['AAPL', 110]]) };
      const service = new PortfolioService({
        repository: portfolio,
        snapshots,
        prices,
        inflation: flatInflation(0),
        eurValue: { EUR: 1 },
        now: () => new Date('2026-03-10T15:00:00Z'),
      });

      await service.recordTransaction({ userId, type: 'BOUGHT', symbol: 'AAPL', quantity: 10, amount: 1000, fee: 0, currency: 'EUR', paidWithCash: false, date: '2026-01-05' });
      const overview = await service.overview(userId);
      const history = await service.history(userId);

      expect(overview).toMatchObject({ netWorth: 1100, moneyPutIn: 1000, cashBalance: 0, totalProfit: 100 });
      expect(history.realFrom).toBe('2026-03-10');
      expect(await snapshots.has(userId, '2026-03-10')).toBe(true);
    });
  });
}
