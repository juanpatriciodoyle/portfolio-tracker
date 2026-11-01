import { Router } from 'express';
import type { CapitalHorizonService } from '../application/capitalHorizonService';
import { capitalHorizonQuery, type CalendarDate } from '../contracts';
import { handle, noStore, parseRequest, requireUser, userIdOf } from './http';

export interface CapitalHorizonRouterDeps {
  readonly service: CapitalHorizonService;
  readonly today: () => CalendarDate;
}

/** The goals a person saves toward and how long each is away. Mounted under /api; needs a bearer token. */
export function createCapitalHorizonRouter({ service, today }: CapitalHorizonRouterDeps): Router {
  const router = Router();
  router.use('/insights/capital-horizon', noStore, requireUser);

  router.get(
    '/insights/capital-horizon',
    handle(async (req, res) => {
      const { asOf } = parseRequest(capitalHorizonQuery, req.query);
      res.json(await service.capitalHorizon(userIdOf(req), asOf ?? today()));
    })
  );

  return router;
}
