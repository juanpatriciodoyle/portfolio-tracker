import { PortfolioService, type RecordTransactionCommand } from '../application/portfolioService';
import type { PriceProvider } from '../application/ports';
import { ResourceNotFoundError } from '../application/errors';
import { InsufficientCashError, InsufficientHoldingsError, TransactionRequiredByLaterError } from '../domain/errors';
import { WORLD_INDEX_SYMBOL } from '../domain/portfolioSnapshots';
import { flatInflation, InMemoryPortfolioRepository, InMemorySnapshotRepository } from './support/inMemoryPortfolio';

const ALICE = 'alice';
const NOW = new Date('2026-03-10T15:00:00Z');
const EUR_VALUE = { EUR: 1, USD: 0.5, GBP: 1.2 };

function build(prices: Record<string, number> = {}, options: { now?: Date } = {}) {
  const repository = new InMemoryPortfolioRepository();
  repository.addOwner({ id: ALICE, country: 'Spain', baseCurrency: 'EUR' });
  const snapshots = new InMemorySnapshotRepository();
  let table = { ...prices };
  const provider: PriceProvider = { pricesFor: async (symbols) => new Map(symbols.flatMap((symbol) => (table[symbol.toUpperCase()] !== undefined ? [[symbol.toUpperCase(), table[symbol.toUpperCase()]] as [string, number]] : []))) };
  const service = new PortfolioService({ repository, snapshots, prices: provider, inflation: flatInflation(0), eurValue: EUR_VALUE, now: () => options.now ?? NOW });
  return { service, repository, snapshots, setPrices: (next: Record<string, number>) => void (table = next) };
}

const command = (extra: Partial<RecordTransactionCommand>): RecordTransactionCommand => ({
  userId: ALICE,
  type: 'DEPOSIT',
  symbol: 'DEPOSIT',
  quantity: 1,
  amount: 0,
  fee: 0,
  currency: 'EUR',
  paidWithCash: false,
  date: '2026-01-05',
  ...extra,
});
const deposit = (amount: number, extra: Partial<RecordTransactionCommand> = {}) => command({ type: 'DEPOSIT', amount, ...extra });
const buy = (symbol: string, quantity: number, amount: number, extra: Partial<RecordTransactionCommand> = {}) =>
  command({ type: 'BOUGHT', symbol, quantity, amount, ...extra });
const sell = (symbol: string, quantity: number, amount: number, extra: Partial<RecordTransactionCommand> = {}) =>
  command({ type: 'SOLD', symbol, quantity, amount, ...extra });

describe('a buy is new money unless it is paid with cash', () => {
  it('leaves cash at zero and counts the amount as money put in, fee included', async () => {
    const { service } = build({ AAPL: 110 });
    await service.recordTransaction(buy('AAPL', 10, 1000, { fee: 5 }));

    const overview = await service.overview(ALICE);

    expect(overview.cashBalance).toBe(0);
    expect(overview.moneyPutIn).toBe(1005);
    expect(overview.netWorth).toBe(1100);
    expect(overview.totalProfit).toBe(100 - 5);
    expect(overview.cashBalances).toEqual([]);
  });

  it('draws on the cash held and brings no new money when paid with cash', async () => {
    const { service } = build({ AAPL: 100 });
    await service.recordTransaction(deposit(2000));
    await service.recordTransaction(buy('AAPL', 10, 1000, { fee: 4, paidWithCash: true }));

    const overview = await service.overview(ALICE);

    expect(overview.cashBalance).toBe(996);
    expect(overview.moneyPutIn).toBe(2000);
    expect(overview.totalProfit).toBe(-4);
  });

  it('refuses a purchase paid with more cash than is held, and records nothing', async () => {
    const { service, repository } = build({ AAPL: 100 });
    await service.recordTransaction(deposit(500));

    await expect(service.recordTransaction(buy('AAPL', 10, 1000, { paidWithCash: true }))).rejects.toBeInstanceOf(InsufficientCashError);
    expect((await repository.transactions(ALICE)).map((tx) => tx.type)).toEqual(['DEPOSIT']);
    expect(await repository.positions(ALICE)).toEqual([]);
  });

  it('checks the cash in the currency of the purchase, not the total', async () => {
    const { service } = build({ AAPL: 100 });
    await service.recordTransaction(deposit(5000, { currency: 'USD' }));

    await expect(service.recordTransaction(buy('AAPL', 1, 100, { paidWithCash: true, currency: 'EUR' }))).rejects.toBeInstanceOf(InsufficientCashError);
  });

  it('ignores the cash choice on anything but a buy', async () => {
    const { service, repository } = build();
    await service.recordTransaction(deposit(100, { paidWithCash: true }));

    expect((await repository.transactions(ALICE))[0].paidWithCash).toBe(false);
  });
});

describe('a sale always brings its proceeds into cash', () => {
  it('adds the net proceeds to cash and locks in the profit, without counting them as money put in', async () => {
    const { service } = build();
    await service.recordTransaction(buy('AAPL', 10, 1000));
    await service.recordTransaction(sell('AAPL', 10, 1300, { fee: 10, date: '2026-02-01' }));

    const overview = await service.overview(ALICE);

    expect(overview.cashBalance).toBe(1290);
    expect(overview.moneyPutIn).toBe(1000);
    expect(overview.soldProfit).toBe(290);
    expect(overview.positions).toEqual([]);
    expect(overview.netWorth).toBe(1290);
  });

  it('refuses to sell units that are not held', async () => {
    const { service } = build();
    await service.recordTransaction(buy('AAPL', 5, 500));

    await expect(service.recordTransaction(sell('AAPL', 6, 700, { date: '2026-02-01' }))).rejects.toBeInstanceOf(InsufficientHoldingsError);
  });
});

describe('the figures always agree with each other', () => {
  async function mixedPortfolio() {
    const harness = build({ AAPL: 120, VUAA: 55 });
    const { service } = harness;
    await service.recordTransaction(deposit(3000, { date: '2026-01-02' }));
    await service.recordTransaction(buy('AAPL', 10, 1000, { fee: 3, date: '2026-01-03' }));
    await service.recordTransaction(buy('VUAA', 20, 900, { fee: 2, paidWithCash: true, date: '2026-01-04' }));
    await service.recordTransaction(sell('AAPL', 4, 500, { fee: 1, date: '2026-02-01' }));
    await service.recordTransaction(deposit(25, { notes: 'Dividend from VUAA', date: '2026-02-15' }));
    await service.recordTransaction(command({ type: 'WITHDRAWAL', symbol: 'WITHDRAWAL', amount: 300, date: '2026-02-20' }));
    return harness;
  }

  it('net worth minus money put in is the total profit', async () => {
    const { service } = await mixedPortfolio();

    const overview = await service.overview(ALICE);

    expect(overview.netWorth - overview.moneyPutIn).toBeCloseTo(overview.totalProfit, 8);
    expect(overview.totalProfit).toBeCloseTo(overview.soldProfit + overview.openProfit + overview.dividends - 5, 8);
  });

  it('shows one cash figure: the pills add up to it', async () => {
    const { service } = await mixedPortfolio();
    await service.recordTransaction(deposit(1000, { currency: 'USD', date: '2026-03-01' }));

    const overview = await service.overview(ALICE);

    expect(overview.cashBalances.map((line) => line.currency).sort()).toEqual(['EUR', 'USD']);
    expect(overview.cashBalances.reduce((sum, line) => sum + line.balanceInReportingCurrency, 0)).toBeCloseTo(overview.cashBalance, 2);
    expect(overview.netWorth).toBeCloseTo(overview.cashBalance + overview.openMarketValue, 8);
  });

  it('keeps cash from ever being negative', async () => {
    const { service } = await mixedPortfolio();

    const overview = await service.overview(ALICE);

    expect(overview.cashBalance).toBeGreaterThanOrEqual(0);
    expect(overview.cashBalances.every((line) => line.balance >= 0)).toBe(true);
  });

  it('shares of the portfolio never pass one hundred percent', async () => {
    const { service } = await mixedPortfolio();

    const overview = await service.overview(ALICE);

    for (const group of Object.values(overview.breakdowns)) {
      expect(group.reduce((sum, line) => sum + line.percentage, 0)).toBeLessThanOrEqual(100.5);
    }
  });

  it('is all zero for an account with nothing in it, and files no reading', async () => {
    const { service, snapshots } = build();

    const overview = await service.overview(ALICE);

    expect(overview).toMatchObject({ netWorth: 0, cashBalance: 0, moneyPutIn: 0, totalProfit: 0, allTimeRoiPercent: 0 });
    expect(snapshots.saves).toBe(0);
  });
});

describe('readings: the only source of value over time', () => {
  it('files today when the figures are read and shows only that: the line has not started yet', async () => {
    const { service, snapshots } = build({ AAPL: 110, [WORLD_INDEX_SYMBOL]: 100 });
    await service.recordTransaction(buy('AAPL', 10, 1000));

    await service.overview(ALICE);
    const history = await service.history(ALICE);

    expect(snapshots.saves).toBe(1);
    expect(history.realFrom).toBe('2026-03-10');
    expect(history.points).toHaveLength(1);
    expect(history.points[0]).toMatchObject({ portfolio_value_in_reporting_currency: 1100, cumulative_cost_in_reporting_currency: 1000 });
  });

  it('files each day once however often the figures are read', async () => {
    const { service, snapshots } = build({ AAPL: 110 });
    await service.recordTransaction(buy('AAPL', 10, 1000));

    await service.overview(ALICE);
    await service.overview(ALICE);
    await service.history(ALICE);

    expect(snapshots.saves).toBe(1);
  });

  it('does not file a reading when a price is missing: valued at cost it would not be a measurement', async () => {
    const { service, snapshots } = build({});
    await service.recordTransaction(buy('AAPL', 10, 1000));

    const overview = await service.overview(ALICE);
    const history = await service.history(ALICE);

    expect(overview.pricesAvailable).toBe(false);
    expect(snapshots.saves).toBe(0);
    expect(history.points).toHaveLength(1);
  });

  it('shows nothing before the first transaction, even if readings exist', async () => {
    const { service, snapshots } = build();
    await snapshots.save(ALICE, { day: '2026-03-01', currency: 'EUR', totalValue: 10, holdingsValue: 10, cash: 0, moneyPutIn: 10, benchmarkPrice: null });

    expect(await service.history(ALICE)).toEqual({ realFrom: null, points: [] });
  });

  it('builds the line from earlier days plus right now, with the index price of each day', async () => {
    const { service, snapshots } = build({ AAPL: 110, [WORLD_INDEX_SYMBOL]: 105 });
    await service.recordTransaction(buy('AAPL', 10, 1000));
    await snapshots.save(ALICE, { day: '2026-03-08', currency: 'EUR', totalValue: 1000, holdingsValue: 1000, cash: 0, moneyPutIn: 1000, benchmarkPrice: 100 });

    const history = await service.history(ALICE);

    expect(history.realFrom).toBe('2026-03-08');
    expect(history.points.map((p) => p.portfolio_value_in_reporting_currency)).toEqual([1000, 1100]);
    expect(history.points[1].benchmark_value_in_reporting_currency).toBeCloseTo(1050, 6);
  });

  it('has no index line when the index price cannot be read', async () => {
    const { service } = build({ AAPL: 110 });
    await service.recordTransaction(buy('AAPL', 10, 1000));

    const history = await service.history(ALICE);

    expect(history.points[0].benchmark_value_in_reporting_currency).toBeNull();
  });

  it('captureSnapshot replaces the reading of its day, and skips what it cannot measure', async () => {
    const { service, snapshots, setPrices } = build({ AAPL: 110 });
    await service.recordTransaction(buy('AAPL', 10, 1000));

    expect(await service.captureSnapshot(ALICE)).toBe('saved');
    setPrices({ AAPL: 120 });
    expect(await service.captureSnapshot(ALICE)).toBe('saved');
    expect((await snapshots.list(ALICE)).map((s) => s.totalValue)).toEqual([1200]);

    setPrices({});
    expect(await service.captureSnapshot(ALICE)).toBe('skipped');
    expect((await snapshots.list(ALICE)).map((s) => s.totalValue)).toEqual([1200]);
    expect(await build().service.captureSnapshot(ALICE)).toBe('skipped');
  });
});

describe('correcting or removing a transaction', () => {
  const idOf = async (repository: InMemoryPortfolioRepository, index: number) => (await repository.transactions(ALICE))[index].id;

  it('recalculates the position, the profit and the money put in from the corrected ledger', async () => {
    const { service, repository } = build({ AAPL: 100 });
    await service.recordTransaction(buy('AAPL', 10, 1000, { date: '2026-01-05' }));
    await service.recordTransaction(sell('AAPL', 4, 600, { date: '2026-02-01' }));

    await service.updateTransaction({ userId: ALICE, id: await idOf(repository, 0), change: { amount: 1200, quantity: 12 } });

    // 12 units cost 1,200; the 4 sold carried 400 of it away.
    expect(await repository.positions(ALICE)).toMatchObject([{ symbol: 'AAPL', quantity: 8, investedAmount: 800 }]);
    expect(await repository.realizedGains(ALICE)).toMatchObject([{ investedAmount: 400, returnedAmount: 600, realizedPnl: 200 }]);
    const overview = await service.overview(ALICE);
    expect(overview.moneyPutIn).toBe(1200);
    expect(overview.cashBalance).toBe(600);
  });

  it('gives back the units and the cost of a sale that is removed, and takes its proceeds out of cash', async () => {
    const { service, repository } = build({ AAPL: 100 });
    await service.recordTransaction(buy('AAPL', 10, 1000));
    await service.recordTransaction(sell('AAPL', 4, 600, { date: '2026-02-01' }));

    await service.deleteTransaction({ userId: ALICE, id: await idOf(repository, 1) });

    expect(await repository.positions(ALICE)).toMatchObject([{ quantity: 10, investedAmount: 1000 }]);
    expect(await repository.realizedGains(ALICE)).toEqual([]);
    expect((await service.overview(ALICE)).cashBalance).toBe(0);
  });

  it('removes the position when its only purchase is removed', async () => {
    const { service, repository } = build({ AAPL: 100 });
    await service.recordTransaction(buy('AAPL', 10, 1000));

    await service.deleteTransaction({ userId: ALICE, id: await idOf(repository, 0) });

    expect(await repository.positions(ALICE)).toEqual([]);
    expect(await repository.transactions(ALICE)).toEqual([]);
  });

  it('leaves the ledger as it was when a purchase that a later sale needs is removed, and says which sale', async () => {
    const { service, repository } = build({ AAPL: 100 });
    await service.recordTransaction(buy('AAPL', 10, 1000));
    await service.recordTransaction(sell('AAPL', 4, 600, { date: '2026-02-01' }));

    await expect(service.deleteTransaction({ userId: ALICE, id: await idOf(repository, 0) })).rejects.toBeInstanceOf(TransactionRequiredByLaterError);

    expect(await repository.transactions(ALICE)).toHaveLength(2);
    expect(await repository.positions(ALICE)).toMatchObject([{ quantity: 6 }]);
  });

  it('refuses to sell more than was held when a sale is corrected, and to pay with more cash than there is', async () => {
    const { service, repository } = build({ AAPL: 100 });
    await service.recordTransaction(deposit(1500));
    await service.recordTransaction(buy('AAPL', 10, 1000, { paidWithCash: true }));
    await service.recordTransaction(sell('AAPL', 4, 600, { date: '2026-02-01' }));

    await expect(service.updateTransaction({ userId: ALICE, id: await idOf(repository, 2), change: { quantity: 11 } })).rejects.toBeInstanceOf(InsufficientHoldingsError);
    await expect(service.updateTransaction({ userId: ALICE, id: await idOf(repository, 1), change: { amount: 1800 } })).rejects.toBeInstanceOf(InsufficientCashError);
    await expect(service.deleteTransaction({ userId: ALICE, id: await idOf(repository, 0) })).rejects.toBeInstanceOf(TransactionRequiredByLaterError);
  });

  it('can turn a purchase into one paid with cash only while the cash is there', async () => {
    const { service, repository } = build({ AAPL: 100 });
    await service.recordTransaction(deposit(1500));
    await service.recordTransaction(buy('AAPL', 10, 1000));

    await service.updateTransaction({ userId: ALICE, id: await idOf(repository, 1), change: { paidWithCash: true } });

    const overview = await service.overview(ALICE);
    expect(overview.cashBalance).toBe(500);
    expect(overview.moneyPutIn).toBe(1500);
  });

  it('only touches the transactions of the person asking', async () => {
    const { service, repository } = build({ AAPL: 100 });
    await service.recordTransaction(buy('AAPL', 10, 1000));
    const id = await idOf(repository, 0);

    await expect(service.deleteTransaction({ userId: 'bob', id })).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.updateTransaction({ userId: 'bob', id, change: { fee: 1 } })).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.deleteTransaction({ userId: ALICE, id: 'missing' })).rejects.toBeInstanceOf(ResourceNotFoundError);
    expect(await repository.transactions(ALICE)).toHaveLength(1);
  });

  it('ends where the same ledger recorded in order would have, whatever order the corrections came in', async () => {
    const corrected = build({ AAPL: 100 });
    await corrected.service.recordTransaction(buy('AAPL', 10, 1000, { date: '2026-01-05' }));
    await corrected.service.recordTransaction(buy('AAPL', 5, 700, { date: '2026-03-01' }));
    await corrected.service.recordTransaction(sell('AAPL', 6, 900, { date: '2026-04-01' }));
    await corrected.service.updateTransaction({ userId: ALICE, id: await idOf(corrected.repository, 1), change: { amount: 750, date: '2026-02-01' } });

    const fresh = build({ AAPL: 100 });
    await fresh.service.recordTransaction(buy('AAPL', 10, 1000, { date: '2026-01-05' }));
    await fresh.service.recordTransaction(buy('AAPL', 5, 750, { date: '2026-02-01' }));
    await fresh.service.recordTransaction(sell('AAPL', 6, 900, { date: '2026-04-01' }));

    const pick = async (repository: InMemoryPortfolioRepository) => ({
      positions: (await repository.positions(ALICE)).map(({ symbol, quantity, investedAmount }) => ({ symbol, quantity, investedAmount })),
      gains: (await repository.realizedGains(ALICE)).map(({ investedAmount, returnedAmount, realizedPnl }) => ({ investedAmount, returnedAmount, realizedPnl })),
    });
    expect(await pick(corrected.repository)).toEqual(await pick(fresh.repository));
  });

  it('forgets the stored readings from the first day the correction reaches, today included, and keeps the older ones', async () => {
    const { service, repository, snapshots } = build({ AAPL: 100 });
    await service.recordTransaction(buy('AAPL', 10, 1000, { date: '2026-01-05' }));
    await service.recordTransaction(buy('AAPL', 2, 200, { date: '2026-03-01' }));
    const reading = (day: string) => ({ day, currency: 'EUR', totalValue: 1, holdingsValue: 1, cash: 0, moneyPutIn: 1, benchmarkPrice: null });
    for (const day of ['2026-02-01', '2026-03-01', '2026-03-05', '2026-03-10']) await snapshots.save(ALICE, reading(day));

    await service.updateTransaction({ userId: ALICE, id: await idOf(repository, 1), change: { amount: 250 } });

    expect((await snapshots.list(ALICE)).map((snapshot) => snapshot.day)).toEqual(['2026-02-01']);
  });

  it('forgets today and everything after it too when the corrected transaction is older than every reading kept', async () => {
    const { service, repository, snapshots } = build({ AAPL: 100 });
    await service.recordTransaction(buy('AAPL', 10, 1000, { date: '2026-01-05' }));
    await snapshots.save(ALICE, { day: '2026-03-10', currency: 'EUR', totalValue: 1, holdingsValue: 1, cash: 0, moneyPutIn: 1, benchmarkPrice: null });

    await service.updateTransaction({ userId: ALICE, id: await idOf(repository, 0), change: { fee: 3 } });

    expect(await snapshots.list(ALICE)).toEqual([]);
  });
});
