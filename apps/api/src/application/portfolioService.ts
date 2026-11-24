import { ResourceNotFoundError } from './errors';
import type { InflationRates, PortfolioOwner, PortfolioRepository, PriceProvider, SnapshotRepository, StoredPosition, StoredRealizedGain, StoredTransaction } from './ports';
import { assertCashCovers, cashBalances, dividendsReceived, moneyPutIn, moneyPutInEffect, totalCash } from '../domain/cashLedger';
import { assertSaleCovered } from '../domain/holdingLedger';
import { amendedRow, assertAmendmentAllowed, earliestAffectedDay, rebuildInstrument, type LedgerRow } from '../domain/ledgerAmendment';
import { contributionsInflationLoss, inflationLossAmount } from '../domain/inflation';
import { valueOpenPosition, type PositionValue } from '../domain/openPosition';
import { summarizeReturn, type ReturnSummary } from '../domain/portfolioReturn';
import { buildGrowthHistory, snapshotDay, WORLD_INDEX_SYMBOL, type GrowthHistory, type PortfolioSnapshot } from '../domain/portfolioSnapshots';
import { planTransaction, type TransactionCommand } from '../domain/transactionPlan';

/** What the routes hand over to record a transaction: parsed, with the person already known from the session. */
export interface RecordTransactionCommand {
  readonly userId: string;
  readonly type: TransactionCommand['type'];
  readonly symbol: string;
  readonly name?: string;
  readonly assetClass?: string;
  readonly region?: string;
  readonly sector?: string;
  readonly quantity: number;
  readonly amount: number;
  readonly fee: number;
  readonly currency: string;
  readonly notes?: string;
  readonly date?: string;
  readonly paidWithCash: boolean;
}

/** A correction of one transaction: only the fields that are present change. */
export interface AmendTransactionCommand {
  readonly userId: string;
  readonly id: string;
  readonly change: {
    readonly date?: string;
    readonly quantity?: number;
    readonly amount?: number;
    readonly fee?: number;
    readonly paidWithCash?: boolean;
    readonly notes?: string;
  };
}

export interface RemoveTransactionCommand {
  readonly userId: string;
  readonly id: string;
}

export interface CashBalanceLine {
  readonly currency: string;
  readonly balance: number;
  readonly balanceInReportingCurrency: number;
  readonly percentage: number;
}

export interface BreakdownLine {
  readonly name: string;
  readonly amount: number;
  readonly percentage: number;
}

export interface OpenHolding {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly assetClass: string;
  readonly region: string;
  readonly sector: string;
  readonly quantity: number;
  readonly investedAmount: number;
  readonly costPerShare: number;
  readonly currentPrice: number;
  readonly currentValue: number;
  readonly openProfit: number;
  readonly priced: boolean;
  readonly holdingDays: number;
  readonly createdAt: Date;
}

export interface SoldHolding {
  readonly id: string;
  readonly symbol: string;
  readonly assetClass: string;
  readonly region: string;
  readonly sector: string;
  readonly investedAmount: number;
  readonly returnedAmount: number;
  readonly soldProfit: number;
  readonly soldProfitPercent: number;
  readonly holdingInflationPercent: number;
  readonly realProfitEuros: number;
  readonly date: Date;
}

/** `GET /api/portfolio/stats`: every figure of the home screen, computed once, here. */
export interface PortfolioOverview {
  /** Cash plus everything held at market price. */
  readonly netWorth: number;
  /** The same in today's purchasing power. */
  readonly realNetWorth: number;
  /** The one cash figure: every currency converted and added, replayed from the transactions. */
  readonly cashBalance: number;
  readonly cashBalances: readonly CashBalanceLine[];
  /** Money put in minus money taken out; dividends and cash that was already in are not counted again. */
  readonly moneyPutIn: number;
  readonly openInvestedValue: number;
  readonly openMarketValue: number;
  readonly soldProfit: number;
  readonly openProfit: number;
  readonly realSoldProfit: number;
  readonly realOpenProfit: number;
  readonly dividends: number;
  readonly pricesAvailable: boolean;
  readonly totalProfit: number;
  readonly totalFees: number;
  readonly allTimeRoiPercent: number;
  readonly realProfitEuros: number;
  readonly realRoiPercent: number;
  readonly country: string;
  readonly baseCurrency: string;
  readonly breakdowns: { readonly regions: BreakdownLine[]; readonly sectors: BreakdownLine[]; readonly assetClasses: BreakdownLine[] };
  readonly positions: readonly OpenHolding[];
  readonly soldAssets: readonly SoldHolding[];
}

export interface PortfolioServiceDeps {
  readonly repository: PortfolioRepository;
  readonly snapshots: SnapshotRepository;
  readonly prices: PriceProvider;
  readonly inflation: InflationRates;
  /** What one unit of each currency is worth in euros: the one table every conversion uses. */
  readonly eurValue: Readonly<Record<string, number>>;
  readonly now: () => Date;
}

const cents = (value: number) => Math.round(value * 100) / 100;
const MS_PER_DAY = 86_400_000;

const DEFAULTS = { assetClass: 'Stock', region: 'Europe', sector: 'Technology' } as const;

/** Everything read about one person at one instant, so every figure is computed from the same moment. */
interface PortfolioState {
  readonly owner: PortfolioOwner;
  readonly transactions: readonly StoredTransaction[];
  readonly gains: readonly StoredRealizedGain[];
  readonly valued: ReadonlyArray<{ position: StoredPosition; value: PositionValue }>;
  readonly summary: ReturnSummary;
  readonly cash: number;
  readonly balances: Readonly<Record<string, number>>;
  readonly moneyPutIn: number;
  readonly netWorth: number;
}

/**
 * The portfolio use cases. Commands change the ledger and answer with the row they saved; queries only read. The one exception is
 * deliberate and cheap: reading the figures also files today's snapshot when it is missing, so the value history starts without
 * waiting for the daily job. The maths all lives in `domain/`; this class only fetches, orders and hands over.
 */
export class PortfolioService {
  constructor(private readonly deps: PortfolioServiceDeps) {}

  /** Records a transaction and everything it changes, refusing a sale of units not held and a cash purchase without the cash. */
  async recordTransaction(request: RecordTransactionCommand): Promise<StoredTransaction> {
    const command = this.toCommand(request);
    const { repository } = this.deps;

    if (command.type === 'SOLD' || (command.type === 'BOUGHT' && command.paidWithCash)) {
      const ledger = await repository.transactions(request.userId);
      if (command.type === 'SOLD') assertSaleCovered(ledger, command.symbol, command.quantity, command.date);
      else assertCashCovers(cashBalances(ledger), command.currency, command.amount + command.fee);
    }

    const held = command.type === 'BOUGHT' || command.type === 'SOLD' ? await repository.findPosition(request.userId, command.symbol) : null;
    return repository.record(request.userId, planTransaction(command, held));
  }

  /**
   * Corrects a transaction of the person's ledger. The ledger is the source of truth, so the positions and realized gains of its
   * instrument are rebuilt from it; the change is refused when it would leave a later transaction without the units or the cash it needs.
   */
  async updateTransaction({ userId, id, change }: AmendTransactionCommand): Promise<void> {
    const ledger = await this.deps.repository.transactions(userId);
    const current = this.find(ledger, id);
    const next = amendedRow(current, { ...change, date: change.date ? new Date(change.date) : undefined });
    await this.amend(userId, current, next, ledger.map((row) => (row.id === id ? next : row)));
  }

  /** Removes a transaction from the ledger under the same rules as a correction. */
  async deleteTransaction({ userId, id }: RemoveTransactionCommand): Promise<void> {
    const ledger = await this.deps.repository.transactions(userId);
    const current = this.find(ledger, id);
    await this.amend(userId, current, null, ledger.filter((row) => row.id !== id));
  }

  private find(ledger: readonly LedgerRow[], id: string): LedgerRow {
    const found = ledger.find((row) => row.id === id);
    if (!found) throw new ResourceNotFoundError('Transaction not found');
    return found;
  }

  private async amend(userId: string, current: LedgerRow, next: LedgerRow | null, after: readonly LedgerRow[]): Promise<void> {
    assertAmendmentAllowed(await this.deps.repository.transactions(userId), after, current.id);

    const instrument = current.type === 'BOUGHT' || current.type === 'SOLD' ? rebuildInstrument(after, current.symbol) : null;
    const amended = await this.deps.repository.amend(
      userId,
      next
        ? {
            kind: 'update',
            id: current.id,
            data: { date: next.date, quantity: next.quantity, amount: next.amount, fee: next.fee, totalAmount: next.totalAmount, paidWithCash: next.paidWithCash, notes: next.notes ?? null },
            instrument,
          }
        : { kind: 'delete', id: current.id, instrument }
    );
    if (!amended) throw new ResourceNotFoundError('Transaction not found');

    // The readings taken since describe a ledger that no longer exists. They go, today's included (it is filed again on the next read):
    // an honest gap is better than a line drawn from figures that were never true.
    const today = this.deps.now();
    const from = earliestAffectedDay(current, next);
    await this.deps.snapshots.deleteFrom(userId, snapshotDay(from.getTime() < today.getTime() ? from : today));
  }

  /** All the cash the person holds, as one figure in their reporting currency. */
  async cashBalance(userId: string): Promise<number> {
    return (await this.load(userId)).cash;
  }

  async overview(userId: string): Promise<PortfolioOverview> {
    const { inflation, now } = this.deps;
    const state = await this.load(userId);
    const { owner, transactions, valued, summary, gains } = state;
    await inflation.sync(owner.country);
    const today = now();
    if (transactions.length > 0) await this.fileToday(userId, state, await this.readingOf(state, today));

    // What each holding lost to inflation while it was held.
    let openInflationLoss = 0;
    for (const { position } of valued) {
      openInflationLoss += inflationLossAmount(position.investedAmount, await inflation.between(owner.country, position.createdAt, today));
    }
    let soldInflationLoss = 0;
    const soldAssets: SoldHolding[] = [];
    for (const gain of gains) {
      const percent = await inflation.between(owner.country, gain.createdAt, gain.date);
      const loss = inflationLossAmount(gain.investedAmount, percent);
      soldInflationLoss += loss;
      soldAssets.push({
        id: gain.id,
        symbol: gain.symbol,
        assetClass: gain.assetClass,
        region: gain.region,
        sector: gain.sector,
        investedAmount: gain.investedAmount,
        returnedAmount: gain.returnedAmount,
        soldProfit: gain.realizedPnl,
        soldProfitPercent: gain.realizedPnlPercent,
        holdingInflationPercent: percent,
        realProfitEuros: gain.realizedPnl - loss,
        date: gain.date,
      });
    }

    // Net worth in today's purchasing power: what each amount put in lost since the day it went in (money taken out takes its share away).
    const inflationSince = new Map<number, number>();
    const moves = transactions.filter((tx) => moneyPutInEffect(tx) !== 0);
    for (const tx of moves) {
      const day = tx.date.getTime();
      if (!inflationSince.has(day)) inflationSince.set(day, await inflation.between(owner.country, tx.date, today));
    }
    const realNetWorth =
      state.netWorth - contributionsInflationLoss(moves.map((tx) => ({ amount: moneyPutInEffect(tx), inflationPercent: inflationSince.get(tx.date.getTime()) ?? 0 })));

    const realProfitEuros = summary.totalReturn - (openInflationLoss + soldInflationLoss);
    const totalFees = transactions.reduce((sum, tx) => sum + tx.fee, 0);
    const reportingCurrency = owner.baseCurrency;

    const cashLines = Object.entries(state.balances)
      .filter(([, balance]) => Math.abs(balance) > 0.001)
      .map(([currency, balance]) => ({
        currency,
        balance: cents(balance),
        balanceInReportingCurrency: cents(totalCash({ [currency]: balance }, reportingCurrency, this.deps.eurValue)),
        percentage: 0,
      }));
    const cashTotal = cashLines.reduce((sum, line) => sum + line.balanceInReportingCurrency, 0);
    const cashBalanceLines: CashBalanceLine[] = cashLines
      .map((line) => ({ ...line, percentage: cashTotal > 0 ? Math.round((line.balanceInReportingCurrency / cashTotal) * 10000) / 100 : 0 }))
      .sort((a, b) => b.balanceInReportingCurrency - a.balanceInReportingCurrency);

    return {
      netWorth: state.netWorth,
      realNetWorth,
      cashBalance: state.cash,
      cashBalances: cashBalanceLines,
      moneyPutIn: state.moneyPutIn,
      openInvestedValue: valued.reduce((sum, { position }) => sum + position.investedAmount, 0),
      openMarketValue: summary.openValue,
      soldProfit: summary.realizedPnl,
      openProfit: summary.unrealizedPnl,
      // The same two figures after the inflation lost while each asset was held (they add up to realProfitEuros with dividends and buying fees).
      realSoldProfit: summary.realizedPnl - soldInflationLoss,
      realOpenProfit: summary.unrealizedPnl - openInflationLoss,
      dividends: summary.dividends,
      pricesAvailable: summary.allPriced,
      totalProfit: summary.totalReturn,
      totalFees,
      allTimeRoiPercent: summary.totalReturnPercent,
      realProfitEuros,
      realRoiPercent: state.moneyPutIn > 0 ? (realProfitEuros / state.moneyPutIn) * 100 : 0,
      country: owner.country,
      baseCurrency: reportingCurrency,
      breakdowns: breakdownsOf(state),
      positions: valued.map(({ position, value }) => holdingOf(position, value, today)),
      soldAssets,
    };
  }

  /** The value over time: real daily readings plus right now. Empty until the person has a transaction. */
  async history(userId: string): Promise<GrowthHistory> {
    const state = await this.load(userId);
    if (state.transactions.length === 0) return { realFrom: null, points: [] };

    const at = this.deps.now();
    const live = await this.readingOf(state, at);
    await this.fileToday(userId, state, live);
    return buildGrowthHistory(await this.deps.snapshots.list(userId), { at, snapshot: live });
  }

  /** The daily job: files today's reading for one person, replacing the one already there. Skipped without transactions or without every price. */
  async captureSnapshot(userId: string): Promise<'saved' | 'skipped'> {
    const state = await this.load(userId);
    if (state.transactions.length === 0 || !state.summary.allPriced) return 'skipped';
    await this.deps.snapshots.save(userId, await this.readingOf(state, this.deps.now()));
    return 'saved';
  }

  private async fileToday(userId: string, state: PortfolioState, reading: PortfolioSnapshot): Promise<void> {
    // A reading valued partly at cost is not a measurement: it is never filed.
    if (!state.summary.allPriced) return;
    if (await this.deps.snapshots.has(userId, reading.day)) return;
    await this.deps.snapshots.save(userId, reading);
  }

  private async readingOf(state: PortfolioState, at: Date): Promise<PortfolioSnapshot> {
    const { owner } = state;
    const indexPrice = (await this.deps.prices.pricesFor([WORLD_INDEX_SYMBOL], owner.baseCurrency)).get(WORLD_INDEX_SYMBOL);
    return {
      day: snapshotDay(at),
      currency: owner.baseCurrency,
      totalValue: state.netWorth,
      holdingsValue: state.summary.openValue,
      cash: state.cash,
      moneyPutIn: state.moneyPutIn,
      benchmarkPrice: indexPrice !== undefined && Number.isFinite(indexPrice) && indexPrice > 0 ? indexPrice : null,
    };
  }

  private async load(userId: string): Promise<PortfolioState> {
    const { repository, prices, eurValue } = this.deps;
    const [owner, transactions, positions, gains] = await Promise.all([
      repository.owner(userId),
      repository.transactions(userId),
      repository.positions(userId),
      repository.realizedGains(userId),
    ]);
    const person = owner ?? { id: userId, country: 'Spain', baseCurrency: 'EUR' };

    const priceBySymbol = await prices.pricesFor(positions.map((position) => position.symbol), person.baseCurrency);
    const valued = positions.map((position) => ({ position, value: valueOpenPosition(position, priceBySymbol.get(position.symbol.toUpperCase()) ?? null) }));

    const balances = cashBalances(transactions);
    const cash = totalCash(balances, person.baseCurrency, eurValue);
    const putIn = moneyPutIn(transactions);
    const summary = summarizeReturn({
      realizedPnl: gains.reduce((sum, gain) => sum + gain.realizedPnl, 0),
      dividends: dividendsReceived(transactions),
      buyFees: transactions.filter((tx) => tx.type === 'BOUGHT').reduce((sum, tx) => sum + tx.fee, 0),
      contributed: putIn,
      openPositions: valued.map(({ value }) => value),
    });

    return { owner: person, transactions, gains, valued, summary, cash, balances, moneyPutIn: putIn, netWorth: cash + summary.openValue };
  }

  private toCommand(request: RecordTransactionCommand): TransactionCommand {
    const symbol = request.symbol.toUpperCase();
    return {
      type: request.type,
      symbol,
      name: request.name || symbol,
      assetClass: request.assetClass ?? DEFAULTS.assetClass,
      region: request.region ?? DEFAULTS.region,
      sector: request.sector ?? DEFAULTS.sector,
      quantity: request.quantity,
      amount: request.amount,
      fee: request.fee,
      currency: request.currency,
      notes: request.notes,
      date: request.date ? new Date(request.date) : this.deps.now(),
      paidWithCash: request.type === 'BOUGHT' && request.paidWithCash,
    };
  }
}

function holdingOf(position: StoredPosition, value: PositionValue, today: Date): OpenHolding {
  const holdingDays = Math.max(1, Math.floor((today.getTime() - position.createdAt.getTime()) / MS_PER_DAY));
  const costPerShare = position.quantity > 0 ? position.investedAmount / position.quantity : 0;
  return {
    id: position.id,
    symbol: position.symbol,
    name: position.name || position.symbol,
    assetClass: position.assetClass,
    region: position.region,
    sector: position.sector,
    quantity: position.quantity,
    investedAmount: position.investedAmount,
    costPerShare: cents(costPerShare),
    currentPrice: value.priced && position.quantity > 0 ? cents(value.marketValue / position.quantity) : cents(costPerShare),
    currentValue: value.marketValue,
    openProfit: value.unrealizedPnl,
    priced: value.priced,
    holdingDays,
    createdAt: position.createdAt,
  };
}

/** What the portfolio is made of, by region, sector and asset class, each as a share of everything it is worth. */
function breakdownsOf(state: PortfolioState): PortfolioOverview['breakdowns'] {
  const regions: Record<string, number> = {};
  const sectors: Record<string, number> = {};
  const assetClasses: Record<string, number> = {};
  const add = (totals: Record<string, number>, key: string, amount: number) => void (totals[key] = (totals[key] ?? 0) + amount);

  if (state.cash > 0) {
    add(assetClasses, 'Cash', state.cash);
    add(regions, 'Global', state.cash);
    add(sectors, 'Financials', state.cash);
  }
  for (const { position, value } of state.valued) {
    add(regions, position.region, value.marketValue);
    add(sectors, position.sector, value.marketValue);
    add(assetClasses, position.assetClass, value.marketValue);
  }

  const lines = (totals: Record<string, number>): BreakdownLine[] =>
    Object.entries(totals).map(([name, amount]) => ({ name, amount, percentage: state.netWorth > 0 ? Math.round((amount / state.netWorth) * 1000) / 10 : 0 }));
  return { regions: lines(regions), sectors: lines(sectors), assetClasses: lines(assetClasses) };
}
