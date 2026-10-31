import { scheduleBenchmarkRefresh } from '../infrastructure/benchmarks/refreshSchedule';

describe('scheduleBenchmarkRefresh', () => {
  it('runs shortly after start and then every day, and stops when asked', () => {
    jest.useFakeTimers();
    const run = jest.fn(async () => 'ran' as const);

    const stop = scheduleBenchmarkRefresh({ run });
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(61_000);
    expect(run).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(24 * 3_600_000);
    expect(run).toHaveBeenCalledTimes(2);

    stop();
    jest.advanceTimersByTime(48 * 3_600_000);
    expect(run).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('does not let a failing run stop the schedule or crash the server', async () => {
    jest.useFakeTimers();
    const run = jest.fn(async (): Promise<'ran'> => {
      throw new Error('down');
    });
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const stop = scheduleBenchmarkRefresh({ run });
    jest.advanceTimersByTime(61_000);
    await Promise.resolve();
    jest.advanceTimersByTime(24 * 3_600_000);

    expect(run).toHaveBeenCalledTimes(2);
    stop();
    quiet.mockRestore();
    jest.useRealTimers();
  });
});
