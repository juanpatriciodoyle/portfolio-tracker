import { Router } from 'express';
import type { BenchmarkService } from '../application/benchmarkService';
import { benchmarksQuery, type CalendarDate } from '../contracts';
import { handle, noStore, parseRequest, requireUser, userIdOf } from './http';

export interface BenchmarksRouterDeps {
  readonly service: BenchmarkService;
  readonly today: () => CalendarDate;
}

/** How each living phase compares with its country's public statistics. Mounted under /api; needs a bearer token. */
export function createBenchmarksRouter({ service, today }: BenchmarksRouterDeps): Router {
  const router = Router();
  router.use('/insights/benchmarks', noStore, requireUser);

  router.get(
    '/insights/benchmarks',
    handle(async (req, res) => {
      const { asOf } = parseRequest(benchmarksQuery, req.query);
      res.json(await service.benchmarks(userIdOf(req), asOf ?? today()));
    })
  );

  return router;
}
