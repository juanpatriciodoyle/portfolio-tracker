import { z } from 'zod';
import { calendarDateSchema, countryCodeSchema, currencyCodeSchema } from './primitives';

/** Where a statistic comes from. NUMBEO is optional and only used when the server has a key. */
export const BENCHMARK_SOURCES = ['EUROSTAT', 'INDEC', 'WORLD_BANK', 'NUMBEO'] as const;
export const benchmarkSourceSchema = z.enum(BENCHMARK_SOURCES);
export type BenchmarkSource = z.infer<typeof benchmarkSourceSchema>;

/** Why a comparison could not be made, so the UI can say so plainly instead of showing nothing. */
export const BENCHMARK_GAPS = ['NO_INCOME', 'NO_DISTRIBUTION', 'NO_HOUSING_BASELINE', 'NO_PURCHASING_POWER', 'CURRENCY_MISMATCH'] as const;
export const benchmarkGapSchema = z.enum(BENCHMARK_GAPS);
export type BenchmarkGap = z.infer<typeof benchmarkGapSchema>;

/**
 * Where the household's income sits among people in the country. `bound` is EXACT for a position between published
 * points and AT_MOST / AT_LEAST when the income is outside the published range.
 */
export const incomePercentileSchema = z.object({
  percentile: z.number().min(0).max(100),
  bound: z.enum(['EXACT', 'AT_MOST', 'AT_LEAST']),
  /** The period the statistic describes, such as "2025" or "2026-Q1". */
  period: z.string(),
  source: benchmarkSourceSchema,
  basis: z.enum(['EQUIVALISED', 'PER_CAPITA']),
});
export type IncomePercentileDto = z.infer<typeof incomePercentileSchema>;

/** The share of income that goes on rent, utilities and property taxes, against the typical household in the country. */
export const housingBurdenSchema = z.object({
  housingMonthlyMinor: z.number().int().min(0),
  yourSharePercent: z.number(),
  typicalSharePercent: z.number(),
  differencePoints: z.number(),
  verdict: z.enum(['LOWER', 'SIMILAR', 'HIGHER']),
  period: z.string(),
  source: benchmarkSourceSchema,
});
export type HousingBurdenDto = z.infer<typeof housingBurdenSchema>;

/** What the income buys at average world prices (PPP), and against the previous living phase that has a figure. */
export const purchasingPowerSchema = z.object({
  internationalDollarsPerMonth: z.number(),
  /** Multiple of the previous phase's purchasing power (above 1: this home's income buys more); null for the first phase. */
  versusPreviousPhase: z.object({ phaseId: z.string(), ratio: z.number() }).nullable(),
  /** The same income per person per year against the country's average (GNI per person, PPP), if published. */
  versusNationalAverage: z.number().nullable(),
  period: z.string(),
  source: benchmarkSourceSchema,
});
export type PurchasingPowerDto = z.infer<typeof purchasingPowerSchema>;

/** What the income of a living phase amounts to in the country of one of the person's other nationalities. */
export const nationalityEquivalenceSchema = z.object({
  countryCode: countryCodeSchema,
  currency: currencyCodeSchema,
  /** The monthly amount in that country's currency that buys what the income buys here (PPP). */
  equivalentMonthlyIncomeMinor: z.number().int().min(0),
  /** Where that amount would sit among people in that country; null when it publishes no comparable distribution. */
  incomePercentile: incomePercentileSchema.nullable(),
});
export type NationalityEquivalenceDto = z.infer<typeof nationalityEquivalenceSchema>;

export const phaseBenchmarkSchema = z.object({
  phaseId: z.string(),
  name: z.string(),
  countryCode: countryCodeSchema,
  currency: currencyCodeSchema,
  monthlyIncomeMinor: z.number().int().min(0),
  household: z.object({ adults: z.number().int().min(1), children: z.number().int().min(0) }),
  incomePercentile: incomePercentileSchema.nullable(),
  housingBurden: housingBurdenSchema.nullable(),
  purchasingPower: purchasingPowerSchema.nullable(),
  nationalityEquivalences: z.array(nationalityEquivalenceSchema),
  gaps: z.array(benchmarkGapSchema),
});
export type PhaseBenchmarkDto = z.infer<typeof phaseBenchmarkSchema>;

export const benchmarksQuery = z.object({ asOf: calendarDateSchema.optional() });

/** Oldest phase first. `refreshedAt` is when the statistics were last fetched (null while none has been). */
export const benchmarksResponse = z.object({
  asOf: calendarDateSchema,
  refreshedAt: z.string().nullable(),
  phases: z.array(phaseBenchmarkSchema),
});
export type BenchmarksResponse = z.infer<typeof benchmarksResponse>;
