import type { PrismaClient } from '@prisma/client';
import type { DemoPortfolioWriter } from '../application/guestSeeder';
import { DEMO_LEDGER, DEMO_POSITIONS, DEMO_REALIZED_GAINS } from '../domain/demoPortfolio';

/**
 * Writes a copy of the demo portfolio for one guest, in one transaction: a guest never starts with half of it.
 * It goes straight to the tables, like every portfolio write today; when the portfolio's own repository takes over
 * those tables (and seals them), this is the only place the demo has to change.
 */
export class PrismaDemoPortfolio implements DemoPortfolioWriter {
  constructor(private readonly db: PrismaClient) {}

  async write(userId: string): Promise<void> {
    await this.db.$transaction([
      this.db.transaction.createMany({ data: DEMO_LEDGER.map((transaction) => ({ userId, ...transaction })) }),
      this.db.position.createMany({ data: DEMO_POSITIONS.map((position) => ({ userId, ...position })) }),
      this.db.realizedGain.createMany({ data: DEMO_REALIZED_GAINS.map((gain) => ({ userId, ...gain })) }),
    ]);
  }
}
