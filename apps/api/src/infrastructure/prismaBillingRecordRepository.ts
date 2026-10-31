import { Prisma, type PrismaClient } from '@prisma/client';
import type { BillingRecordRepository, StoredBillingRecord, StoredBillingRecordChange } from '../application/ports';
import type { CalendarDate } from '../contracts/vocabulary';

const toDate = (value: CalendarDate) => new Date(`${value}T00:00:00.000Z`);
const toCalendarDate = (value: Date): CalendarDate => value.toISOString().slice(0, 10);

const toStored = (row: {
  id: string;
  phaseId: string;
  category: StoredBillingRecord['category'];
  cadence: StoredBillingRecord['cadence'];
  periodStart: Date;
  periodEnd: Date;
  payload: string;
  fingerprint: string | null;
}): StoredBillingRecord => ({
  id: row.id,
  phaseId: row.phaseId,
  category: row.category,
  cadence: row.cadence,
  periodStart: toCalendarDate(row.periodStart),
  periodEnd: toCalendarDate(row.periodEnd),
  payload: row.payload,
  fingerprint: row.fingerprint,
});

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Stores bills in Postgres. Every query is filtered by the user, so foreign rows never appear. */
export class PrismaBillingRecordRepository implements BillingRecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, filter: { phaseId?: string } = {}): Promise<StoredBillingRecord[]> {
    const rows = await this.prisma.billingRecord.findMany({
      where: { userId, ...(filter.phaseId !== undefined ? { phaseId: filter.phaseId } : {}) },
      orderBy: [{ periodStart: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toStored);
  }

  async find(userId: string, recordId: string): Promise<StoredBillingRecord | null> {
    const row = await this.prisma.billingRecord.findFirst({ where: { id: recordId, userId } });
    return row ? toStored(row) : null;
  }

  async create(userId: string, record: StoredBillingRecord): Promise<'created' | 'phase-missing' | 'duplicate'> {
    const phase = await this.prisma.livingPhase.findFirst({ where: { id: record.phaseId, userId }, select: { id: true } });
    if (!phase) return 'phase-missing';
    try {
      await this.prisma.billingRecord.create({
        data: {
          id: record.id,
          userId,
          phaseId: record.phaseId,
          category: record.category,
          cadence: record.cadence,
          periodStart: toDate(record.periodStart),
          periodEnd: toDate(record.periodEnd),
          payload: record.payload,
          fingerprint: record.fingerprint,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return 'duplicate';
      throw error;
    }
    return 'created';
  }

  async update(userId: string, recordId: string, change: StoredBillingRecordChange): Promise<'updated' | 'missing' | 'duplicate'> {
    try {
      const { count } = await this.prisma.billingRecord.updateMany({
        where: { id: recordId, userId },
        data: {
          category: change.category,
          cadence: change.cadence,
          periodStart: change.periodStart === undefined ? undefined : toDate(change.periodStart),
          periodEnd: change.periodEnd === undefined ? undefined : toDate(change.periodEnd),
          payload: change.payload,
          fingerprint: change.fingerprint,
        },
      });
      return count > 0 ? 'updated' : 'missing';
    } catch (error) {
      if (isUniqueViolation(error)) return 'duplicate';
      throw error;
    }
  }

  async findIdByFingerprint(userId: string, fingerprint: string): Promise<string | null> {
    const row = await this.prisma.billingRecord.findFirst({ where: { userId, fingerprint }, select: { id: true } });
    return row?.id ?? null;
  }

  async delete(userId: string, recordId: string): Promise<boolean> {
    const { count } = await this.prisma.billingRecord.deleteMany({ where: { id: recordId, userId } });
    return count > 0;
  }
}
