import { Router } from 'express';
import { z } from 'zod';
import type { BillingRecordService } from '../application/billingRecordService';
import {
  calendarDateSchema,
  createBillingRecordRequest,
  updateBillingRecordRequest,
  type CalendarDate,
} from '../contracts';
import { handle, noStore, parseRequest, requireUser, userIdOf } from './http';

const idSchema = z.string().min(1).max(100);
const listQuery = z.object({ phaseId: idSchema.optional() });
const trendsQuery = z.object({ asOf: calendarDateSchema.optional() });
const recordParams = z.object({ id: idSchema });

export interface BillingRecordsRouterDeps {
  readonly service: BillingRecordService;
  readonly today: () => CalendarDate;
}

/** HTTP for bills and the trends built from them. Mounted under /api; every route needs a bearer token. */
export function createBillingRecordsRouter({ service, today }: BillingRecordsRouterDeps): Router {
  const router = Router();
  // Scoped to these paths so the other /api routes are left alone (see livingPhases.ts).
  router.use(['/billing-records', '/insights'], noStore, requireUser);

  router.get(
    '/billing-records',
    handle(async (req, res) => {
      res.json(await service.listRecords(userIdOf(req), parseRequest(listQuery, req.query)));
    })
  );

  router.post(
    '/billing-records',
    handle(async (req, res) => {
      res.status(201).json(await service.createRecord(userIdOf(req), parseRequest(createBillingRecordRequest, req.body)));
    })
  );

  router.patch(
    '/billing-records/:id',
    handle(async (req, res) => {
      const { id } = parseRequest(recordParams, req.params);
      await service.updateRecord(userIdOf(req), id, parseRequest(updateBillingRecordRequest, req.body));
      res.status(204).end();
    })
  );

  router.delete(
    '/billing-records/:id',
    handle(async (req, res) => {
      const { id } = parseRequest(recordParams, req.params);
      await service.deleteRecord(userIdOf(req), id);
      res.status(204).end();
    })
  );

  router.get(
    '/insights/trends',
    handle(async (req, res) => {
      const { asOf } = parseRequest(trendsQuery, req.query);
      res.json(await service.trends(userIdOf(req), asOf ?? today()));
    })
  );

  return router;
}
