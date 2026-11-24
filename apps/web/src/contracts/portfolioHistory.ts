// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { z } from 'zod';

/** One real reading of the portfolio, in the person's reporting currency. */
export const historyPoint = z.object({
  date_time: z.string(),
  portfolio_value_in_reporting_currency: z.number(),
  /** The money the person had put in by then (money taken out subtracted). */
  cumulative_cost_in_reporting_currency: z.number(),
  /** The money put in or taken out since the previous reading. */
  cashflow_in_reporting_currency: z.number(),
  /** What the same money would be worth in a world-index fund; null where the index price was unknown. */
  benchmark_value_in_reporting_currency: z.number().nullable(),
});
export type HistoryPoint = z.infer<typeof historyPoint>;

/**
 * `GET /api/portfolio/history`: the value over time, made only of readings really taken (one a day) and of right now.
 * Days before `realFrom` were never measured, so nothing is shown for them and no period reaching further back is offered.
 */
export const portfolioHistoryResponse = z.object({
  /** The first day with a real reading, "YYYY-MM-DD"; null when there is none yet. */
  realFrom: z.string().nullable(),
  points: z.array(historyPoint),
});
export type PortfolioHistoryResponse = z.infer<typeof portfolioHistoryResponse>;
