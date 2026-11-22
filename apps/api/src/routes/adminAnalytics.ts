import { Router } from 'express';
import type { UsageAnalyticsService } from '../application/usageAnalyticsService';
import type { AuthenticatedRequest } from '../lib/auth';
import { handle, noStore, requireUser, userIdOf } from './http';

/** What only the administrator may see. Who is asking comes from the signed session, and the service checks it twice. */
export function createAdminAnalyticsRouter(analytics: UsageAnalyticsService): Router {
  const router = Router();
  router.use('/admin', noStore, requireUser);

  router.get(
    '/admin/analytics',
    handle(async (req, res) => {
      const admin = (req as AuthenticatedRequest).admin === true;
      res.json(await analytics.usage({ userId: userIdOf(req), admin }));
    })
  );

  return router;
}
