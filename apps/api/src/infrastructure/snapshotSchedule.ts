import { errorName, log } from '../lib/logger';

const FIRST_RUN_DELAY_MS = 2 * 60_000;
/** Exactly a day, so every UTC day holds exactly one run. */
const INTERVAL_MS = 24 * 3_600_000;

/**
 * Takes the daily reading of every portfolio: one run shortly after start, then every day. Readings are also taken when the
 * figures are read, so this mostly matters for people who did not open the app that day. Timers never keep the process alive.
 * Returns a stop function.
 */
export function scheduleSnapshots(job: { run(): Promise<unknown> }): () => void {
  const run = () => {
    job.run().catch((error: unknown) => log.error('snapshot_job_failed', { error: errorName(error) }));
  };
  const first = setTimeout(run, FIRST_RUN_DELAY_MS);
  const daily = setInterval(run, INTERVAL_MS);
  first.unref();
  daily.unref();
  return () => {
    clearTimeout(first);
    clearInterval(daily);
  };
}
