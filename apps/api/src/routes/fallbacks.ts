import type { ErrorRequestHandler, RequestHandler } from 'express';
import { INTERNAL_ERROR_MESSAGE, type ApiErrorResponse } from '../contracts';
import { errorName, type Logger } from '../lib/logger';

/** Nothing the app sends as JSON is anywhere near this: a bigger body is a mistake or an attack. (PDF uploads have their own limit.) */
export const JSON_BODY_LIMIT = '100kb';

/** Any address under /api that no route answered. */
export const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found.' } satisfies ApiErrorResponse);
};

/** The last stop: body-parser failures get their own plain answer; anything else is a 500 that says nothing about itself. */
export function apiErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) return next(error);

    const status = (error as { status?: number; type?: string }).status;
    const type = (error as { type?: string }).type;
    if (type === 'entity.too.large') return void res.status(413).json({ error: 'That request is too large.' } satisfies ApiErrorResponse);
    if (type === 'entity.parse.failed' || status === 400) return void res.status(400).json({ error: 'That request could not be read.' } satisfies ApiErrorResponse);

    logger.error('unhandled_error', { error: errorName(error) });
    res.status(500).json({ error: INTERNAL_ERROR_MESSAGE } satisfies ApiErrorResponse);
  };
}
