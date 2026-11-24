import { scheduleGuestSweep } from '../infrastructure/guestSweepSchedule';

describe('scheduleGuestSweep', () => {
  afterEach(() => jest.useRealTimers());

  it('sweeps once at start, then every five minutes, and stops when asked', () => {
    jest.useFakeTimers();
    const sweep = jest.fn(async () => 0);

    const stop = scheduleGuestSweep({ sweep });
    jest.advanceTimersByTime(30_000);
    expect(sweep).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5 * 60_000);
    expect(sweep).toHaveBeenCalledTimes(2);

    stop();
    jest.advanceTimersByTime(60 * 60_000);
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it('does not let a failing sweep stop the schedule or crash the server', async () => {
    jest.useFakeTimers();
    const sweep = jest.fn(async (): Promise<number> => {
      throw new Error('down');
    });
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const stop = scheduleGuestSweep({ sweep });
    jest.advanceTimersByTime(30_000);
    await Promise.resolve();
    jest.advanceTimersByTime(5 * 60_000);

    expect(sweep).toHaveBeenCalledTimes(2);
    stop();
    quiet.mockRestore();
  });
});
