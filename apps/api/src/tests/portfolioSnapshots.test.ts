import { buildGrowthHistory, snapshotDay, type PortfolioSnapshot } from '../domain/portfolioSnapshots';

const snap = (day: string, totalValue: number, moneyPutIn: number, benchmarkPrice: number | null = null): PortfolioSnapshot => ({
  day,
  currency: 'EUR',
  totalValue,
  holdingsValue: totalValue,
  cash: 0,
  moneyPutIn,
  benchmarkPrice,
});

const NOW = new Date('2026-03-10T15:30:00Z');

describe('snapshotDay', () => {
  it('is the UTC calendar day, whatever the time', () => {
    expect(snapshotDay(new Date('2026-03-10T23:59:59Z'))).toBe('2026-03-10');
    expect(snapshotDay(new Date('2026-03-11T00:00:00Z'))).toBe('2026-03-11');
  });
});

describe('buildGrowthHistory: real history only', () => {
  it('has nothing without snapshots and without a live reading', () => {
    expect(buildGrowthHistory([], null)).toEqual({ realFrom: null, points: [] });
  });

  it('starts today when there is only a live reading', () => {
    const history = buildGrowthHistory([], { at: NOW, snapshot: snap('2026-03-10', 1200, 1000) });
    expect(history.realFrom).toBe('2026-03-10');
    expect(history.points).toHaveLength(1);
    expect(history.points[0]).toMatchObject({
      date_time: NOW.toISOString(),
      portfolio_value_in_reporting_currency: 1200,
      cumulative_cost_in_reporting_currency: 1000,
      cashflow_in_reporting_currency: 1000,
    });
  });

  it('turns each stored day into a point valued at what it really was, oldest first', () => {
    const history = buildGrowthHistory([snap('2026-03-02', 1100, 1000), snap('2026-03-01', 1000, 1000)], null);
    expect(history.realFrom).toBe('2026-03-01');
    expect(history.points.map((p) => p.date_time.slice(0, 10))).toEqual(['2026-03-01', '2026-03-02']);
    expect(history.points.map((p) => p.portfolio_value_in_reporting_currency)).toEqual([1000, 1100]);
  });

  it('reads the money moved in a day as the change in money put in', () => {
    const history = buildGrowthHistory([snap('2026-03-01', 1000, 1000), snap('2026-03-02', 1600, 1500), snap('2026-03-03', 1590, 1500)], null);
    expect(history.points.map((p) => p.cashflow_in_reporting_currency)).toEqual([1000, 500, 0]);
  });

  it("replaces today's stored reading with the live one rather than showing today twice", () => {
    const history = buildGrowthHistory([snap('2026-03-09', 1000, 1000), snap('2026-03-10', 1010, 1000)], { at: NOW, snapshot: snap('2026-03-10', 1050, 1000) });
    expect(history.points).toHaveLength(2);
    expect(history.points[1]).toMatchObject({ date_time: NOW.toISOString(), portfolio_value_in_reporting_currency: 1050 });
  });

  it('says real history began on the earliest stored day even if the live reading is later', () => {
    const history = buildGrowthHistory([snap('2026-03-01', 1000, 1000)], { at: NOW, snapshot: snap('2026-03-10', 1100, 1000) });
    expect(history.realFrom).toBe('2026-03-01');
  });
});

describe('buildGrowthHistory: the world-index benchmark', () => {
  it('has no benchmark when no day had an index price', () => {
    const history = buildGrowthHistory([snap('2026-03-01', 1000, 1000), snap('2026-03-02', 1010, 1000)], null);
    expect(history.points.map((p) => p.benchmark_value_in_reporting_currency)).toEqual([null, null]);
  });

  it('starts level with the portfolio and then follows the index', () => {
    const history = buildGrowthHistory([snap('2026-03-01', 1000, 1000, 100), snap('2026-03-02', 1020, 1000, 105), snap('2026-03-03', 1010, 1000, 99)], null);
    const benchmark = history.points.map((p) => p.benchmark_value_in_reporting_currency);
    expect(benchmark[0]).toBe(1000);
    expect(benchmark[1]).toBeCloseTo(1050, 6);
    expect(benchmark[2]).toBeCloseTo(990, 6);
  });

  it("invests new money in the index at that day's price", () => {
    const history = buildGrowthHistory([snap('2026-03-01', 1000, 1000, 100), snap('2026-03-02', 1500, 1500, 110)], null);
    // 1000 grew with the index to 1100, and the 500 added that day went in at 110: no growth yet.
    expect(history.points[1].benchmark_value_in_reporting_currency).toBeCloseTo(1600, 6);
  });

  it('leaves a day without an index price empty and carries on over it', () => {
    const history = buildGrowthHistory(
      [snap('2026-03-01', 1000, 1000, 100), snap('2026-03-02', 1000, 1100, null), snap('2026-03-03', 1000, 1200, 120)],
      null
    );
    const benchmark = history.points.map((p) => p.benchmark_value_in_reporting_currency);
    expect(benchmark[1]).toBeNull();
    // 1000 followed the index from 100 to 120; the 100 added on the gap day and the 100 added that day both go in at 120.
    expect(benchmark[2]).toBeCloseTo(1400, 6);
  });

  it('starts at the first day that has a price, level with the portfolio that day', () => {
    const history = buildGrowthHistory([snap('2026-03-01', 1000, 1000, null), snap('2026-03-02', 1100, 1000, 50)], null);
    expect(history.points.map((p) => p.benchmark_value_in_reporting_currency)).toEqual([null, 1100]);
  });
});
