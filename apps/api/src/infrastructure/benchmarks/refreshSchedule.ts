const FIRST_RUN_DELAY_MS = 60_000;
const INTERVAL_MS = 24 * 3_600_000;

/**
 * Keeps country statistics fresh without anyone asking: one run a minute after start, then daily. Each run only fetches
 * what is older than the cache allows, so most runs do nothing. Timers never keep the process alive. Returns a stop function.
 */
export function scheduleBenchmarkRefresh(refresher: { run(): Promise<unknown> }): () => void {
  const run = () => {
    refresher.run().catch((error: unknown) => console.error('Benchmark refresh failed:', error instanceof Error ? error.name : 'unknown'));
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
