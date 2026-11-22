import { Router } from 'express';
import type { AppConfigResponse } from '../contracts';

/** Public: what the sign-in screen needs before anyone is signed in. */
export function createAppConfigRouter(config: AppConfigResponse): Router {
  const router = Router();
  router.get('/config', (_req, res) => {
    res.json(config satisfies AppConfigResponse);
  });
  return router;
}
