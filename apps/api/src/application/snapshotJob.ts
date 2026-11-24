import type { JobLock, PortfolioRepository } from './ports';

const JOB_NAME = 'portfolio-snapshots';

/**
 * The daily reading of everyone's portfolio. Under an advisory lock so that with several servers only one takes it; a failure for
 * one person never stops the others. A person with no transactions, or whose prices were not all available, is skipped: a
 * reading valued partly at cost is not a measurement.
 */
export class SnapshotJob {
  constructor(
    private readonly deps: {
      readonly repository: Pick<PortfolioRepository, 'usersWithTransactions'>;
      readonly capture: (userId: string) => Promise<'saved' | 'skipped'>;
      readonly lock: JobLock;
      readonly onFailure: (error: unknown) => void;
    }
  ) {}

  async run(): Promise<{ saved: number; skipped: number; failed: number } | 'skipped'> {
    const totals = { saved: 0, skipped: 0, failed: 0 };
    const outcome = await this.deps.lock.runExclusive(JOB_NAME, async () => {
      for (const userId of await this.deps.repository.usersWithTransactions()) {
        try {
          totals[(await this.deps.capture(userId)) === 'saved' ? 'saved' : 'skipped'] += 1;
        } catch (error) {
          totals.failed += 1;
          this.deps.onFailure(error);
        }
      }
    });
    return outcome === 'ran' ? totals : 'skipped';
  }
}
