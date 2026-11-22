import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../lib/logger';

const QUIET_PATHS = new Set(['/api/health', '/api/ready']);

/** One line per request: method, path without its query string, status and how long it took. No headers, no body. */
export function requestLogger(logger: Logger, clock: () => number = Date.now) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = clock();
    res.on('finish', () => {
      const path = req.originalUrl.split('?')[0];
      if (QUIET_PATHS.has(path)) return;
      logger.info('request', { method: req.method, path, status: res.statusCode, durationMs: clock() - startedAt });
    });
    next();
  };
}
