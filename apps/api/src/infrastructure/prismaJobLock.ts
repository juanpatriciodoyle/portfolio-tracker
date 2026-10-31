import type { PrismaClient } from '@prisma/client';
import type { JobLock } from '../application/ports';

const ONE_HOUR_MS = 3_600_000;

/**
 * A Postgres advisory lock that lives as long as one transaction, so with several servers only one runs the job.
 * The lock is released when the transaction ends, even if the server dies.
 */
export class PrismaJobLock implements JobLock {
  constructor(private readonly prisma: PrismaClient) {}

  async runExclusive(name: string, task: () => Promise<void>): Promise<'ran' | 'skipped'> {
    return this.prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${name})) AS locked`;
        if (!locked) return 'skipped' as const;
        await task();
        return 'ran' as const;
      },
      { timeout: ONE_HOUR_MS, maxWait: 5_000 }
    );
  }
}
