import { errorName, log } from '../lib/logger';

const FIRST_RUN_DELAY_MS = 30_000;
const INTERVAL_MS = 5 * 60_000;

/**
 * Erases the demo accounts whose hour is over, without anyone asking: once shortly after start (which also clears
 * whatever an earlier version or a crash left behind), then every five minutes. Timers never keep the process alive.
 * Returns a stop function.
 */
export function scheduleGuestSweep(sweeper: { sweep(): Promise<unknown> }): () => void {
  const run = () => {
    sweeper.sweep().catch((error: unknown) => log.error('guest_sweep_failed', { error: errorName(error) }));
  };
  const first = setTimeout(run, FIRST_RUN_DELAY_MS);
  const repeating = setInterval(run, INTERVAL_MS);
  first.unref();
  repeating.unref();
  return () => {
    clearTimeout(first);
    clearInterval(repeating);
  };
}
