import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  LivingPhaseRepository,
  StoredCostChange,
  StoredFixedCost,
  StoredLivingPhase,
  StoredPhaseChange,
} from '../application/ports';
import type { CalendarDate } from '../contracts/vocabulary';

const toDate = (value: CalendarDate) => new Date(`${value}T00:00:00.000Z`);
const toCalendarDate = (value: Date): CalendarDate => value.toISOString().slice(0, 10);

const withCosts = {
  fixedCosts: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.LivingPhaseInclude;

type PhaseRow = Prisma.LivingPhaseGetPayload<{ include: typeof withCosts }>;

const toStored = (row: PhaseRow): StoredLivingPhase => ({
  id: row.id,
  startDate: toCalendarDate(row.startDate),
  endDate: row.endDate ? toCalendarDate(row.endDate) : null,
  currency: row.currency,
  countryCode: row.countryCode,
  tenure: row.tenure,
  payload: row.payload,
  fixedCosts: row.fixedCosts.map(({ id, category, cadence, payload }) => ({ id, category, cadence, payload })),
});

/** Stores living phases in Postgres. Every query is filtered by the user, so foreign rows never appear. */
export class PrismaLivingPhaseRepository implements LivingPhaseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<StoredLivingPhase[]> {
    const rows = await this.prisma.livingPhase.findMany({
      where: { userId },
      include: withCosts,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toStored);
  }

  async find(userId: string, phaseId: string): Promise<StoredLivingPhase | null> {
    const row = await this.prisma.livingPhase.findFirst({ where: { id: phaseId, userId }, include: withCosts });
    return row ? toStored(row) : null;
  }

  async createMany(userId: string, phases: readonly StoredLivingPhase[]): Promise<void> {
    await this.prisma.$transaction(
      phases.map((phase) =>
        this.prisma.livingPhase.create({
          data: {
            id: phase.id,
            userId,
            startDate: toDate(phase.startDate),
            endDate: phase.endDate ? toDate(phase.endDate) : null,
            currency: phase.currency,
            countryCode: phase.countryCode,
            tenure: phase.tenure,
            payload: phase.payload,
            fixedCosts: { create: phase.fixedCosts.map(({ id, category, cadence, payload }) => ({ id, category, cadence, payload })) },
          },
        })
      )
    );
  }

  async update(userId: string, phaseId: string, change: StoredPhaseChange): Promise<boolean> {
    const { count } = await this.prisma.livingPhase.updateMany({
      where: { id: phaseId, userId },
      data: {
        startDate: change.startDate === undefined ? undefined : toDate(change.startDate),
        endDate: change.endDate === undefined ? undefined : change.endDate === null ? null : toDate(change.endDate),
        currency: change.currency,
        countryCode: change.countryCode,
        tenure: change.tenure,
        payload: change.payload,
      },
    });
    return count > 0;
  }

  async delete(userId: string, phaseId: string): Promise<boolean> {
    const { count } = await this.prisma.livingPhase.deleteMany({ where: { id: phaseId, userId } });
    return count > 0;
  }

  async addFixedCost(userId: string, phaseId: string, cost: StoredFixedCost): Promise<boolean> {
    const phase = await this.prisma.livingPhase.findFirst({ where: { id: phaseId, userId }, select: { id: true } });
    if (!phase) return false;
    await this.prisma.fixedCostItem.create({
      data: { id: cost.id, phaseId, category: cost.category, cadence: cost.cadence, payload: cost.payload },
    });
    return true;
  }

  async updateFixedCost(userId: string, phaseId: string, costId: string, change: StoredCostChange): Promise<boolean> {
    const { count } = await this.prisma.fixedCostItem.updateMany({
      where: { id: costId, phaseId, phase: { userId } },
      data: { category: change.category, cadence: change.cadence, payload: change.payload },
    });
    return count > 0;
  }

  async deleteFixedCost(userId: string, phaseId: string, costId: string): Promise<boolean> {
    const { count } = await this.prisma.fixedCostItem.deleteMany({ where: { id: costId, phaseId, phase: { userId } } });
    return count > 0;
  }
}
