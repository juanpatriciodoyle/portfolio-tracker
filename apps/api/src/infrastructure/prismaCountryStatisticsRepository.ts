import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { CountryStatisticsRepository, StoredCountryStatistics } from '../application/ports';
import { benchmarkSourceSchema } from '../contracts/benchmark';

const origin = { source: benchmarkSourceSchema, period: z.string() };
const statisticsSchema = z.object({
  countryCode: z.string(),
  incomeDistribution: z
    .object({
      ...origin,
      currency: z.string(),
      distribution: z.object({
        period: z.enum(['MONTH', 'YEAR']),
        basis: z.enum(['EQUIVALISED', 'PER_CAPITA']),
        points: z.array(z.object({ percentile: z.number(), value: z.number() })),
      }),
    })
    .nullable(),
  housingCostShare: z.object({ ...origin, percent: z.number() }).nullable(),
  purchasing: z.object({ ...origin, lcuPerInternationalDollar: z.number(), gniPerPersonDollars: z.number().nullable() }).nullable(),
});

/** Public statistics in Postgres. A row that no longer matches the expected shape counts as missing, so it is simply fetched again. */
export class PrismaCountryStatisticsRepository implements CountryStatisticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(countryCode: string): Promise<StoredCountryStatistics | null> {
    const row = await this.prisma.countryStatistics.findUnique({ where: { countryCode } });
    const parsed = row && statisticsSchema.safeParse(row.payload);
    return row && parsed?.success ? { statistics: parsed.data, fetchedAt: row.fetchedAt.toISOString() } : null;
  }

  async save({ statistics, fetchedAt }: StoredCountryStatistics): Promise<void> {
    const payload = statistics as unknown as Prisma.InputJsonValue;
    await this.prisma.countryStatistics.upsert({
      where: { countryCode: statistics.countryCode },
      create: { countryCode: statistics.countryCode, payload, fetchedAt: new Date(fetchedAt) },
      update: { payload, fetchedAt: new Date(fetchedAt) },
    });
  }
}
