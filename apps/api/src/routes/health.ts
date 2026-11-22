import { Router } from 'express';

interface HealthChecks {
  /** Runs a trivial query. Rejects when the database cannot be reached. */
  readonly checkDatabase: () => Promise<void>;
  readonly timeoutMs?: number;
}

const answersWithin = (check: () => Promise<void>, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    check().then(
      () => (clearTimeout(timer), resolve(true)),
      () => (clearTimeout(timer), resolve(false))
    );
  });

/** Liveness (the process is up) and readiness (it can reach its database). Neither says anything about why it failed. */
export function createHealthRouter({ checkDatabase, timeoutMs = 2000 }: HealthChecks): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const ready = await answersWithin(checkDatabase, timeoutMs);
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
  });

  return router;
}
