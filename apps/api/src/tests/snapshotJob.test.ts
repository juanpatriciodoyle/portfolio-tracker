import { SnapshotJob } from '../application/snapshotJob';
import type { JobLock } from '../application/ports';

const lock = (outcome: 'ran' | 'skipped' = 'ran'): JobLock => ({
  runExclusive: async (_name, task) => {
    if (outcome === 'ran') await task();
    return outcome;
  },
});

const job = (users: string[], capture: (userId: string) => Promise<'saved' | 'skipped'>, failures: unknown[] = [], lockOutcome: 'ran' | 'skipped' = 'ran') =>
  new SnapshotJob({
    repository: { usersWithTransactions: async () => users },
    capture,
    lock: lock(lockOutcome),
    onFailure: (error) => failures.push(error),
  });

describe('SnapshotJob', () => {
  it('takes a reading for everyone with transactions and counts what it did', async () => {
    const captured: string[] = [];
    const result = await job(['a', 'b', 'c'], async (userId) => {
      captured.push(userId);
      return userId === 'b' ? 'skipped' : 'saved';
    }).run();

    expect(captured).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ saved: 2, skipped: 1, failed: 0 });
  });

  it('carries on past one person it fails for, and reports it', async () => {
    const failures: unknown[] = [];
    const result = await job(
      ['a', 'b', 'c'],
      async (userId) => {
        if (userId === 'b') throw new Error('prices down');
        return 'saved';
      },
      failures
    ).run();

    expect(result).toEqual({ saved: 2, skipped: 0, failed: 1 });
    expect(failures).toHaveLength(1);
  });

  it('does nothing when another server already holds the lock', async () => {
    const capture = jest.fn(async () => 'saved' as const);

    expect(await job(['a'], capture, [], 'skipped').run()).toBe('skipped');
    expect(capture).not.toHaveBeenCalled();
  });

  it('is fine with nobody to measure', async () => {
    expect(await job([], async () => 'saved').run()).toEqual({ saved: 0, skipped: 0, failed: 0 });
  });
});
