import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { SnapshotRepository } from '../application/ports';
import type { PortfolioSnapshot } from '../domain/portfolioSnapshots';

/** The numbers of one reading, kept together in one column so they can be sealed as one payload later. */
const storedValues = z.object({
  totalValue: z.number(),
  holdingsValue: z.number(),
  cash: z.number(),
  moneyPutIn: z.number(),
  benchmarkPrice: z.number().nullable(),
});

const toDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

export class PrismaSnapshotRepository implements SnapshotRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<PortfolioSnapshot[]> {
    const rows = await this.prisma.portfolioSnapshot.findMany({ where: { userId }, orderBy: { day: 'asc' } });
    return rows.flatMap((row) => {
      // A reading that cannot be read back is left out: a gap is honest, a guess is not.
      const values = storedValues.safeParse(row.values);
      return values.success ? [{ day: row.day.toISOString().slice(0, 10), currency: row.currency, ...values.data }] : [];
    });
  }

  async save(userId: string, snapshot: PortfolioSnapshot): Promise<void> {
    const { day, currency, ...values } = snapshot;
    await this.prisma.portfolioSnapshot.upsert({
      where: { userId_day: { userId, day: toDate(day) } },
      create: { userId, day: toDate(day), currency, values },
      update: { currency, values },
    });
  }

  async deleteFrom(userId: string, day: string): Promise<void> {
    await this.prisma.portfolioSnapshot.deleteMany({ where: { userId, day: { gte: toDate(day) } } });
  }

  async saveMany(userId: string, snapshots: readonly PortfolioSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    await this.prisma.portfolioSnapshot.createMany({
      data: snapshots.map(({ day, currency, ...values }) => ({ userId, day: toDate(day), currency, values })),
      skipDuplicates: true,
    });
  }

  async has(userId: string, day: string): Promise<boolean> {
    return (await this.prisma.portfolioSnapshot.count({ where: { userId, day: toDate(day) } })) > 0;
  }
}
