import { Router } from 'express';
import { z } from 'zod';
import type { LivingPhaseService } from '../application/livingPhaseService';
import {
  backfillLivingPhasesRequest,
  calendarDateSchema,
  createFixedCostRequest,
  createLivingPhaseRequest,
  updateFixedCostRequest,
  updateLivingPhaseRequest,
  type CalendarDate,
} from '../contracts';
import { handle, noStore, parseRequest, requireUser, userIdOf } from './http';

const idSchema = z.string().min(1).max(100);
const timelineQuery = z.object({ asOf: calendarDateSchema.optional() });
const compareQuery = z.object({ from: idSchema, to: idSchema });
const phaseParams = z.object({ id: idSchema });
const costParams = z.object({ id: idSchema, costId: idSchema });

export interface LivingPhasesRouterDeps {
  readonly service: LivingPhaseService;
  /** Today as a calendar date; supplied by the shell so the routes stay deterministic under test. */
  readonly today: () => CalendarDate;
}

/** HTTP for living phases and their fixed costs. Mounted under /api; every route needs a bearer token. */
export function createLivingPhasesRouter({ service, today }: LivingPhasesRouterDeps): Router {
  const router = Router();
  // Scoped to this feature's paths: this router is mounted on /api, and a bare router.use would
  // put every other /api route (login, health, ...) behind this feature's token check too.
  router.use('/living-phases', noStore, requireUser);

  router.get(
    '/living-phases',
    handle(async (req, res) => {
      res.json({ phases: await service.listPhases(userIdOf(req)) });
    })
  );

  router.get(
    '/living-phases/timeline',
    handle(async (req, res) => {
      const { asOf } = parseRequest(timelineQuery, req.query);
      res.json(await service.timeline(userIdOf(req), asOf ?? today()));
    })
  );

  router.get(
    '/living-phases/compare',
    handle(async (req, res) => {
      const { from, to } = parseRequest(compareQuery, req.query);
      res.json(await service.compare(userIdOf(req), from, to, today()));
    })
  );

  router.post(
    '/living-phases',
    handle(async (req, res) => {
      const request = parseRequest(createLivingPhaseRequest, req.body);
      res.status(201).json(await service.createPhase(userIdOf(req), request));
    })
  );

  router.post(
    '/living-phases/backfill',
    handle(async (req, res) => {
      const { phases } = parseRequest(backfillLivingPhasesRequest, req.body);
      res.status(201).json(await service.backfillPhases(userIdOf(req), phases));
    })
  );

  router.patch(
    '/living-phases/:id',
    handle(async (req, res) => {
      const { id } = parseRequest(phaseParams, req.params);
      await service.updatePhase(userIdOf(req), id, parseRequest(updateLivingPhaseRequest, req.body));
      res.status(204).end();
    })
  );

  router.delete(
    '/living-phases/:id',
    handle(async (req, res) => {
      const { id } = parseRequest(phaseParams, req.params);
      await service.deletePhase(userIdOf(req), id);
      res.status(204).end();
    })
  );

  router.post(
    '/living-phases/:id/fixed-costs',
    handle(async (req, res) => {
      const { id } = parseRequest(phaseParams, req.params);
      const request = parseRequest(createFixedCostRequest, req.body);
      res.status(201).json(await service.addFixedCost(userIdOf(req), id, request));
    })
  );

  router.patch(
    '/living-phases/:id/fixed-costs/:costId',
    handle(async (req, res) => {
      const { id, costId } = parseRequest(costParams, req.params);
      await service.updateFixedCost(userIdOf(req), id, costId, parseRequest(updateFixedCostRequest, req.body));
      res.status(204).end();
    })
  );

  router.delete(
    '/living-phases/:id/fixed-costs/:costId',
    handle(async (req, res) => {
      const { id, costId } = parseRequest(costParams, req.params);
      await service.deleteFixedCost(userIdOf(req), id, costId);
      res.status(204).end();
    })
  );

  return router;
}
