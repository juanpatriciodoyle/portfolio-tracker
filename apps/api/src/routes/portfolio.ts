import { Router } from 'express';
import { z } from 'zod';
import { handle, noStore, parseRequest, requireUser, userIdOf } from './http';
import { ResourceNotFoundError } from '../application/errors';
import type { AmendTransactionCommand, RecordTransactionCommand, RemoveTransactionCommand } from '../application/portfolioService';
import { recordTransactionRequest, updateTransactionRequest } from '../contracts';

const money = z.coerce.number().refine(Number.isFinite, 'must be a number');

const updateSettingsRequest = z.object({
  country: z.string().trim().min(1).max(80).optional(),
  baseCurrency: z.string().trim().min(3).max(10).optional(),
  annualInflationRate: money.optional(),
});

const syncInflationRequest = z.object({ country: z.string().trim().min(1).max(80).default('Spain') });

export interface UserSettings {
  readonly country: string;
  readonly baseCurrency: string;
  readonly annualInflationRate: number;
}

export interface PortfolioRouterDeps {
  readonly overview: (userId: string) => Promise<unknown>;
  readonly history: (userId: string) => Promise<unknown>;
  readonly listTransactions: (userId: string) => Promise<unknown>;
  readonly recordTransaction: (command: RecordTransactionCommand) => Promise<unknown>;
  readonly updateTransaction: (command: AmendTransactionCommand) => Promise<void>;
  readonly deleteTransaction: (command: RemoveTransactionCommand) => Promise<void>;
  readonly getSettings: (userId: string) => Promise<(UserSettings & { cashBalance: number }) | null>;
  readonly updateSettings: (userId: string, change: z.output<typeof updateSettingsRequest>) => Promise<UserSettings>;
  readonly syncInflation: (country: string) => Promise<number>;
}

/**
 * The original portfolio endpoints. Every one of them acts for the person in the bearer token:
 * a `userId` in the query or body is never read, and there is no "first user" fallback.
 */
export function createPortfolioRouter(deps: PortfolioRouterDeps): Router {
  const router = Router();
  router.use(['/portfolio', '/transactions', '/user'], noStore, requireUser);

  router.get('/portfolio/stats', handle(async (req, res) => void res.json(await deps.overview(userIdOf(req)))));
  router.get('/portfolio/history', handle(async (req, res) => void res.json(await deps.history(userIdOf(req)))));
  router.get('/transactions', handle(async (req, res) => void res.json(await deps.listTransactions(userIdOf(req)))));

  router.post(
    '/transactions',
    handle(async (req, res) => {
      const body = parseRequest(recordTransactionRequest, req.body);
      const transaction = await deps.recordTransaction({
        ...body,
        userId: userIdOf(req),
        symbol: (body.symbol || body.type).toUpperCase(),
        quantity: body.quantity || 1,
        fee: body.fee ?? 0,
        currency: body.currency || 'EUR',
        paidWithCash: body.paidWithCash,
      });
      res.status(201).json({ success: true, message: `Recorded ${body.type} order for ${body.symbol || body.type}`, transaction });
    })
  );

  // Commands answer with no content: the screen asks again for the figures the change moved.
  router.patch(
    '/transactions/:id',
    handle(async (req, res) => {
      const change = parseRequest(updateTransactionRequest, req.body);
      await deps.updateTransaction({ userId: userIdOf(req), id: String(req.params.id), change });
      res.status(204).end();
    })
  );

  router.delete(
    '/transactions/:id',
    handle(async (req, res) => {
      await deps.deleteTransaction({ userId: userIdOf(req), id: String(req.params.id) });
      res.status(204).end();
    })
  );

  router.get(
    '/user/config',
    handle(async (req, res) => {
      const settings = await deps.getSettings(userIdOf(req));
      if (!settings) throw new ResourceNotFoundError('User not found');
      res.json(settings);
    })
  );

  router.post(
    '/user/config',
    handle(async (req, res) => {
      const config = await deps.updateSettings(userIdOf(req), parseRequest(updateSettingsRequest, req.body ?? {}));
      res.json({ success: true, config });
    })
  );

  router.post(
    '/user/sync-inflation',
    handle(async (req, res) => {
      const { country } = parseRequest(syncInflationRequest, req.body ?? {});
      res.json({ success: true, country, annualInflationRate: await deps.syncInflation(country) });
    })
  );

  return router;
}
