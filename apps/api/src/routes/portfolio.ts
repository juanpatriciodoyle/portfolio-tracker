import { Router } from 'express';
import { z } from 'zod';
import { handle, noStore, parseRequest, requireUser, userIdOf } from './http';
import { ResourceNotFoundError } from '../application/errors';

const TRANSACTION_TYPES = ['BOUGHT', 'SOLD', 'DEPOSIT', 'WITHDRAWAL'] as const;

const money = z.coerce.number().refine(Number.isFinite, 'must be a number');

/** The older clients send numbers as strings, so numbers are coerced here once and trusted afterwards. */
const recordTransactionRequest = z.object({
  type: z.enum(TRANSACTION_TYPES),
  symbol: z.string().trim().max(40).optional(),
  name: z.string().max(200).optional(),
  assetClass: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
  sector: z.string().max(60).optional(),
  quantity: money.optional(),
  amount: money,
  fee: money.optional(),
  currency: z.string().max(10).optional(),
  notes: z.string().max(2000).optional(),
  date: z.string().max(40).optional(),
});

const updateSettingsRequest = z.object({
  country: z.string().trim().min(1).max(80).optional(),
  baseCurrency: z.string().trim().min(3).max(10).optional(),
  annualInflationRate: money.optional(),
});

const syncInflationRequest = z.object({ country: z.string().trim().min(1).max(80).default('Spain') });

export interface RecordTransactionCommand {
  readonly userId: string;
  readonly type: (typeof TRANSACTION_TYPES)[number];
  readonly symbol: string;
  readonly name?: string;
  readonly assetClass?: string;
  readonly region?: string;
  readonly sector?: string;
  readonly quantity: number;
  readonly amount: number;
  readonly fee: number;
  readonly currency: string;
  readonly notes?: string;
  readonly date?: string;
}

export interface UserSettings {
  readonly country: string;
  readonly baseCurrency: string;
  readonly annualInflationRate: number;
}

export interface PortfolioRouterDeps {
  readonly overview: (userId: string) => Promise<unknown>;
  readonly history: (userId: string) => Promise<unknown>;
  readonly performancePeriods: (userId: string) => Promise<unknown>;
  readonly listTransactions: (userId: string) => Promise<unknown>;
  readonly recordTransaction: (command: RecordTransactionCommand) => Promise<unknown>;
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
  router.get('/portfolio/performance-periods', handle(async (req, res) => void res.json(await deps.performancePeriods(userIdOf(req)))));
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
      });
      res.status(201).json({ success: true, message: `Recorded ${body.type} order for ${body.symbol || body.type}`, transaction });
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
