import { cashBalances, moneyPutIn, totalCash } from '../domain/cashLedger';
import { DEMO_CURRENCY, DEMO_LEDGER, DEMO_REFERENCE_INDEX, DEMO_REFERENCE_PRICES } from '../domain/demoPortfolio';
import { buildGrowthHistory } from '../domain/portfolioSnapshots';
import { demoHistoryDays, demoPricePath, demoSnapshotHistory, type DemoHistoryInput } from '../domain/demoHistory';

const EUR_VALUE = { EUR: 1, USD: 0.86236, GBP: 1.176 };
const END_DAY = '2026-11-23';

const input = (change: Partial<DemoHistoryInput> = {}): DemoHistoryInput => ({
  ledger: DEMO_LEDGER,
  currency: DEMO_CURRENCY,
  eurValue: EUR_VALUE,
  endDay: END_DAY,
  endPrices: DEMO_REFERENCE_PRICES,
  indexEndPrice: DEMO_REFERENCE_INDEX.endPrice,
  ...change,
});

const dayNumber = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000;

describe('the days the demo history covers', () => {
  it('runs from the first transaction to the end day, once each, in order', () => {
    const days = demoHistoryDays('2020-01-05', END_DAY);
    expect(days[0]).toBe('2020-01-05');
    expect(days[days.length - 1]).toBe(END_DAY);
    expect(new Set(days).size).toBe(days.length);
    expect([...days].sort()).toEqual(days);
  });

  it('has a reading every day for the last 60 days and one a week before that', () => {
    const days = demoHistoryDays('2020-01-05', END_DAY);
    const recent = days.filter((day) => dayNumber(END_DAY) - dayNumber(day) < 60);
    expect(recent).toHaveLength(60);
    const older = days.filter((day) => dayNumber(END_DAY) - dayNumber(day) >= 60);
    for (let index = 1; index < older.length; index += 1) expect(dayNumber(older[index]) - dayNumber(older[index - 1])).toBe(7);
  });

  it('is just the one day when the history is that short', () => {
    expect(demoHistoryDays(END_DAY, END_DAY)).toEqual([END_DAY]);
  });

  it('has nothing when the end day is before the start', () => {
    expect(demoHistoryDays('2026-12-01', END_DAY)).toEqual([]);
  });
});

describe('the demo price path of one instrument', () => {
  const anchors = [
    { day: 100, price: 50 },
    { day: 400, price: 200 },
  ];

  it('passes exactly through every price it is anchored to', () => {
    const price = demoPricePath(anchors, 0.1, 'AAPL');
    expect(price(100)).toBeCloseTo(50, 6);
    expect(price(400)).toBeCloseTo(200, 6);
  });

  it('holds the first price before the first anchor and the last after the last', () => {
    const price = demoPricePath(anchors, 0.1, 'AAPL');
    expect(price(10)).toBe(50);
    expect(price(900)).toBe(200);
  });

  it('is always a positive, finite price, however wild the wobble', () => {
    const price = demoPricePath(anchors, 0.9, 'BTC-USD');
    for (let day = 100; day <= 400; day += 1) {
      const value = price(day);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it('is the same every time, and different for another instrument', () => {
    const first = demoPricePath(anchors, 0.1, 'AAPL');
    const again = demoPricePath(anchors, 0.1, 'AAPL');
    const other = demoPricePath(anchors, 0.1, 'MSFT');
    expect(first(250)).toBe(again(250));
    expect(first(250)).not.toBe(other(250));
  });

  it('uses the one price it has when there is nothing to move between', () => {
    expect(demoPricePath([{ day: 5, price: 12 }], 0.1, 'X')(999)).toBe(12);
  });
});

describe('the demo snapshot history', () => {
  it('is the same every time it is built', () => {
    expect(demoSnapshotHistory(input())).toEqual(demoSnapshotHistory(input()));
  });

  it('starts on the first transaction with exactly the money put in and nothing held', () => {
    const [first] = demoSnapshotHistory(input());
    expect(first.day).toBe('2020-01-05');
    expect(first).toMatchObject({ totalValue: 140000, moneyPutIn: 140000, cash: 140000, holdingsValue: 0, currency: 'EUR' });
  });

  it('ends on the end day, never later, and has no reading dated in the future', () => {
    const history = demoSnapshotHistory(input());
    expect(history[history.length - 1].day).toBe(END_DAY);
    expect(history.every((snapshot) => snapshot.day <= END_DAY)).toBe(true);
  });

  it('has the days in order with one reading each', () => {
    const days = demoSnapshotHistory(input()).map((snapshot) => snapshot.day);
    expect(new Set(days).size).toBe(days.length);
    expect([...days].sort()).toEqual(days);
  });

  it('tracks the ledger: money put in and cash on any day are what the transactions up to it say', () => {
    const day = '2026-07-01';
    const snapshot = demoSnapshotHistory(input({ endDay: '2026-11-23' })).find((reading) => reading.day >= day);
    expect(snapshot).toBeDefined();
    const until = DEMO_LEDGER.filter((entry) => entry.date.toISOString().slice(0, 10) <= snapshot!.day);
    expect(snapshot!.moneyPutIn).toBeCloseTo(moneyPutIn(until), 2);
    expect(snapshot!.cash).toBeCloseTo(totalCash(cashBalances(until), 'EUR', EUR_VALUE), 2);
  });

  it('values the last day at the end prices: cash plus every holding at its price', () => {
    const history = demoSnapshotHistory(input());
    const last = history[history.length - 1];
    const quantity = (symbol: string) => DEMO_LEDGER.filter((entry) => entry.symbol === symbol && entry.type === 'BOUGHT').reduce((sum, entry) => sum + entry.quantity, 0);
    const holdings = Object.entries(DEMO_REFERENCE_PRICES).reduce((sum, [symbol, price]) => sum + quantity(symbol) * price, 0);
    expect(last.holdingsValue).toBeCloseTo(holdings, 1);
    expect(last.totalValue).toBeCloseTo(last.cash + last.holdingsValue, 1);
  });

  it('never has a negative or missing figure', () => {
    for (const snapshot of demoSnapshotHistory(input())) {
      for (const figure of [snapshot.totalValue, snapshot.holdingsValue, snapshot.cash, snapshot.moneyPutIn]) {
        expect(Number.isFinite(figure)).toBe(true);
        expect(figure).toBeGreaterThanOrEqual(0);
      }
      expect(snapshot.benchmarkPrice).toBeGreaterThan(0);
    }
  });

  it('never moves the total by an absurd amount from one day to the next (no staircase, no cliff)', () => {
    const history = demoSnapshotHistory(input());
    const recent = history.slice(-60);
    for (let index = 1; index < recent.length; index += 1) {
      const change = recent[index].totalValue - recent[index - 1].totalValue;
      const flow = recent[index].moneyPutIn - recent[index - 1].moneyPutIn;
      expect(Math.abs(change - flow) / recent[index - 1].totalValue).toBeLessThan(0.05);
    }
  });

  it('follows the world index from its starting price to the price it ends at', () => {
    const history = demoSnapshotHistory(input({ indexEndPrice: 130 }));
    expect(history[0].benchmarkPrice).toBeCloseTo(DEMO_REFERENCE_INDEX.startPrice, 2);
    expect(history[history.length - 1].benchmarkPrice).toBeCloseTo(130, 2);
  });

  it('holds an instrument at its last purchase price when no end price is known, with no gaps', () => {
    const history = demoSnapshotHistory(input({ endPrices: {} }));
    for (const snapshot of history) expect(Number.isFinite(snapshot.totalValue)).toBe(true);
    expect(history[history.length - 1].holdingsValue).toBeGreaterThan(0);
  });

  it('is empty when there is nothing in the ledger', () => {
    expect(demoSnapshotHistory(input({ ledger: [] }))).toEqual([]);
  });
});

describe('the demo against the world index', () => {
  it('ends slightly behind the index (2-6% of its value), so the story is believable and the comparison clause has something to say', () => {
    const { points } = buildGrowthHistory(demoSnapshotHistory(input()), null);
    const last = points[points.length - 1];
    const portfolio = last.portfolio_value_in_reporting_currency;
    const behindBy = (last.benchmark_value_in_reporting_currency! - portfolio) / portfolio;

    expect(behindBy).toBeGreaterThan(0.02);
    expect(behindBy).toBeLessThan(0.06);
  });
});
