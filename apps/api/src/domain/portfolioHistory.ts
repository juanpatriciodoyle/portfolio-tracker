import { costBasisOfSale } from './openPosition';

export interface HistoryTransaction {
  readonly type: 'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL';
  readonly date: Date;
  readonly symbol: string;
  readonly quantity: number;
  readonly amount: number;
  readonly fee: number;
}

export interface HistoryPoint {
  date_time: string;
  portfolio_value_in_reporting_currency: number;
  cumulative_cost_in_reporting_currency: number;
  cashflow_in_reporting_currency: number;
  benchmark_value_in_reporting_currency: number;
  cumulative_time_weighted_return_rate: number;
  cumulative_benchmark_time_weighted_return_rate: number;
}

const BENCHMARK_GROWTH = 1.05;
const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * Replays the ledger into one point per transaction. Past points are valued at cost (there is no price history);
 * when `openPositionsUnrealizedPnl` is given, the final point of `now` is the value at today's market prices.
 */
export function buildPortfolioHistory(
  transactions: readonly HistoryTransaction[],
  now: Date,
  options: { readonly openPositionsUnrealizedPnl?: number } = {}
): HistoryPoint[] {
  if (transactions.length === 0) return [];

  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  const held = new Map<string, { quantity: number; investedAmount: number }>();
  let cash = 0;
  let netContributions = 0;
  const points: HistoryPoint[] = [];

  const pointFor = (date: Date, cashflow: number, extraValue: number): HistoryPoint => {
    const invested = [...held.values()].reduce((sum, position) => sum + position.investedAmount, 0);
    const value = Math.max(0, cash + invested + extraValue);
    const twr = netContributions > 0 ? (value - netContributions) / netContributions : 0;
    return {
      date_time: date.toISOString(),
      portfolio_value_in_reporting_currency: cents(value),
      cumulative_cost_in_reporting_currency: cents(netContributions),
      cashflow_in_reporting_currency: cents(cashflow),
      benchmark_value_in_reporting_currency: cents(netContributions * BENCHMARK_GROWTH),
      cumulative_time_weighted_return_rate: Math.round(twr * 10000) / 10000,
      cumulative_benchmark_time_weighted_return_rate: BENCHMARK_GROWTH - 1,
    };
  };

  for (const tx of sorted) {
    const symbol = tx.symbol.toUpperCase();
    let cashflow = 0;

    if (tx.type === 'DEPOSIT') {
      cash += tx.amount;
      netContributions += tx.amount;
      cashflow = tx.amount;
    } else if (tx.type === 'WITHDRAWAL') {
      cash -= tx.amount;
      netContributions -= tx.amount;
      cashflow = -tx.amount;
    } else if (tx.type === 'BOUGHT') {
      cash -= tx.amount + tx.fee;
      const position = held.get(symbol) ?? { quantity: 0, investedAmount: 0 };
      held.set(symbol, { quantity: position.quantity + tx.quantity, investedAmount: position.investedAmount + tx.amount });
    } else {
      cash += tx.amount - tx.fee;
      const position = held.get(symbol);
      if (position) {
        const basis = costBasisOfSale(position, tx.quantity);
        held.set(symbol, { quantity: Math.max(0, position.quantity - tx.quantity), investedAmount: Math.max(0, position.investedAmount - basis) });
      }
    }

    points.push(pointFor(tx.date, cashflow, 0));
  }

  const marketGain = options.openPositionsUnrealizedPnl;
  const last = points[points.length - 1];
  if (marketGain !== undefined) {
    points.push(pointFor(now, 0, marketGain));
  } else if (new Date(last.date_time).toDateString() !== now.toDateString()) {
    points.push({ ...last, date_time: now.toISOString(), cashflow_in_reporting_currency: 0 });
  }

  return points;
}
