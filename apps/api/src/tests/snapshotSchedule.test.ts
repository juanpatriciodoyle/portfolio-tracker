import { scheduleSnapshots } from '../infrastructure/snapshotSchedule';

describe('scheduleSnapshots', () => {
  afterEach(() => jest.useRealTimers());

  it('runs two minutes after start and then once a day, until stopped', () => {
    jest.useFakeTimers();
    const run = jest.fn(async () => 'ran');

    const stop = scheduleSnapshots({ run });
    jest.advanceTimersByTime(60_000);
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(61_000);
    expect(run).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(24 * 3_600_000);
    expect(run).toHaveBeenCalledTimes(2);

    stop();
    jest.advanceTimersByTime(72 * 3_600_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('survives a failing run', async () => {
    jest.useFakeTimers();
    const run = jest.fn(async (): Promise<string> => {
      throw new Error('down');
    });
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const stop = scheduleSnapshots({ run });
    jest.advanceTimersByTime(121_000);
    await Promise.resolve();
    jest.advanceTimersByTime(24 * 3_600_000);

    expect(run).toHaveBeenCalledTimes(2);
    stop();
    quiet.mockRestore();
  });
});
