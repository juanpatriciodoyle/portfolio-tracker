/** The world-index fund the benchmark follows: iShares Core MSCI World, quoted in euros. Its price is read once a day with the snapshot. */
export const WORLD_INDEX_SYMBOL = 'IWDA.AS';

/** One day's reading of the whole portfolio, in the person's reporting currency. */
export interface PortfolioSnapshot {
  /** The UTC calendar day, "YYYY-MM-DD". */
  readonly day: string;
  readonly currency: string;
  /** Cash plus every holding at market price. */
  readonly totalValue: number;
  readonly holdingsValue: number;
  readonly cash: number;
  /** Money put in minus money taken out so far (see `moneyPutIn`). */
  readonly moneyPutIn: number;
  /** What one unit of the world-index fund cost that day in the reporting currency; null when it could not be read. */
  readonly benchmarkPrice: number | null;
}

export interface HistoryPoint {
  date_time: string;
  portfolio_value_in_reporting_currency: number;
  cumulative_cost_in_reporting_currency: number;
  cashflow_in_reporting_currency: number;
  /** What the same money would be worth in the world-index fund; null where the index price is unknown. */
  benchmark_value_in_reporting_currency: number | null;
}

export interface GrowthHistory {
  /** The first day with a real reading, "YYYY-MM-DD"; null when there is none. Nothing before it is shown: it was never measured. */
  realFrom: string | null;
  points: HistoryPoint[];
}

export const snapshotDay = (date: Date): string => date.toISOString().slice(0, 10);

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * The value-over-time line, built only from readings that were really taken (one a day) plus the live reading of right now.
 * Nothing is replayed or estimated: a day nobody measured is simply not there. `live` replaces the stored reading of its own day.
 * Pure: the clock arrives inside `live`.
 *
 * The benchmark answers "what if the same money had gone into a world-index fund": it starts level with the portfolio on the
 * first day the index price is known, follows the index from there, and invests each later deposit at that day's price.
 */
export function buildGrowthHistory(snapshots: readonly PortfolioSnapshot[], live: { readonly at: Date; readonly snapshot: PortfolioSnapshot } | null): GrowthHistory {
  const stored = [...snapshots].sort((a, b) => a.day.localeCompare(b.day));
  const readings = stored
    .filter((snapshot) => !live || snapshot.day !== live.snapshot.day)
    .map((snapshot) => ({ at: `${snapshot.day}T00:00:00.000Z`, snapshot }));
  if (live) readings.push({ at: live.at.toISOString(), snapshot: live.snapshot });

  if (readings.length === 0) return { realFrom: null, points: [] };

  let benchmark: number | null = null;
  let lastIndexPrice: number | null = null;
  /** Money added on days the index price was unknown: it goes in at the next known price. */
  let flowWaiting = 0;
  let previousPutIn = 0;

  const points = readings.map(({ at, snapshot }, index): HistoryPoint => {
    const flow = index === 0 ? snapshot.moneyPutIn : snapshot.moneyPutIn - previousPutIn;
    previousPutIn = snapshot.moneyPutIn;

    let benchmarkValue: number | null = null;
    if (snapshot.benchmarkPrice !== null) {
      benchmark =
        benchmark === null || lastIndexPrice === null
          ? snapshot.totalValue
          : benchmark * (snapshot.benchmarkPrice / lastIndexPrice) + flowWaiting + flow;
      lastIndexPrice = snapshot.benchmarkPrice;
      flowWaiting = 0;
      benchmarkValue = benchmark;
    } else if (benchmark !== null) {
      flowWaiting += flow;
    }

    return {
      date_time: at,
      portfolio_value_in_reporting_currency: cents(snapshot.totalValue),
      cumulative_cost_in_reporting_currency: cents(snapshot.moneyPutIn),
      cashflow_in_reporting_currency: cents(flow),
      benchmark_value_in_reporting_currency: benchmarkValue === null ? null : cents(benchmarkValue),
    };
  });

  const days = [stored[0]?.day, live?.snapshot.day].filter((day): day is string => day !== undefined).sort();
  return { realFrom: days[0], points };
}
