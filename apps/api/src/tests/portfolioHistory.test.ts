import { buildPortfolioHistory, type HistoryTransaction } from '../domain/portfolioHistory';

const tx = (type: HistoryTransaction['type'], date: string, amount: number, extra: Partial<HistoryTransaction> = {}): HistoryTransaction => ({
  type,
  date: new Date(date),
  symbol: extra.symbol ?? 'CASH',
  quantity: extra.quantity ?? 1,
  amount,
  fee: extra.fee ?? 0,
});

const NOW = new Date('2025-01-01T12:00:00Z');

describe('buildPortfolioHistory', () => {
  it('is empty without transactions', () => {
    expect(buildPortfolioHistory([], NOW)).toEqual([]);
  });

  it('values a sold position once: cash after the sale already holds the profit', () => {
    const points = buildPortfolioHistory(
      [tx('DEPOSIT', '2024-01-01', 1000), tx('BOUGHT', '2024-01-02', 1000, { symbol: 'AAPL', quantity: 10 }), tx('SOLD', '2024-02-01', 1500, { symbol: 'AAPL', quantity: 10 })],
      NOW
    );
    const afterSale = points.find((p) => p.date_time.startsWith('2024-02-01'))!;
    expect(afterSale.portfolio_value_in_reporting_currency).toBe(1500);
  });

  it('books a partial sale against its share of the cost, so a loss shows as a loss', () => {
    const points = buildPortfolioHistory(
      [tx('DEPOSIT', '2024-01-01', 1000), tx('BOUGHT', '2024-01-02', 1000, { symbol: 'AAPL', quantity: 10 }), tx('SOLD', '2024-02-01', 300, { symbol: 'AAPL', quantity: 5 })],
      NOW
    );
    // 500 cash was invested in the 5 units sold and came back as 300: value = 300 cash + 500 still invested.
    const afterSale = points.find((p) => p.date_time.startsWith('2024-02-01'))!;
    expect(afterSale.portfolio_value_in_reporting_currency).toBe(800);
  });

  it('adds a final point at market value when open positions are priced', () => {
    const points = buildPortfolioHistory([tx('DEPOSIT', '2024-01-01', 1000), tx('BOUGHT', '2024-01-02', 600, { symbol: 'AAPL', quantity: 10 })], NOW, { openPositionsUnrealizedPnl: 150 });
    const last = points[points.length - 1];
    expect(last.date_time).toBe(NOW.toISOString());
    expect(last.portfolio_value_in_reporting_currency).toBe(1150);
    expect(last.cumulative_cost_in_reporting_currency).toBe(1000);
  });

  it('records each deposit and withdrawal as a cashflow, and nothing else', () => {
    const points = buildPortfolioHistory([tx('DEPOSIT', '2024-01-01', 1000), tx('WITHDRAWAL', '2024-01-05', 200), tx('BOUGHT', '2024-01-06', 100, { symbol: 'X' })], NOW);
    expect(points.map((p) => p.cashflow_in_reporting_currency)).toEqual([1000, -200, 0, 0]);
  });
});
