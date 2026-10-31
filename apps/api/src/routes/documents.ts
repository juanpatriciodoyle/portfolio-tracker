import express, { Router, type ErrorRequestHandler } from 'express';
import type { DocumentExtractionService } from '../application/documentExtractionService';
import { DocumentRejectedError } from '../application/errors';
import { extractDocumentQuery, MAX_DOCUMENT_BYTES, type CalendarDate } from '../contracts';
import { handle, noStore, parseRequest, requireUser, respondWithError, userIdOf } from './http';

export interface DocumentsRouterDeps {
  readonly service: DocumentExtractionService;
  readonly today: () => CalendarDate;
}

/** A body that is too big is refused by the parser while it streams in, before anything is buffered beyond the limit. */
const bodyErrors: ErrorRequestHandler = (error, _req, res, next) => {
  if (error?.type === 'entity.too.large') return respondWithError(new DocumentRejectedError('DOCUMENT_TOO_LARGE'), res);
  if (error?.type === 'request.aborted' || error?.type === 'request.size.invalid') return respondWithError(new DocumentRejectedError('NOT_A_PDF'), res);
  next(error);
};

/**
 * Reads a bill PDF sent as the raw request body (`Content-Type: application/pdf`). The bytes live in memory for
 * the length of the request and are never written anywhere.
 */
export function createDocumentsRouter({ service, today }: DocumentsRouterDeps): Router {
  const router = Router();
  router.use('/documents', noStore, requireUser);

  router.post(
    '/documents/extract',
    express.raw({ type: 'application/pdf', limit: MAX_DOCUMENT_BYTES }),
    handle(async (req, res) => {
      const { phaseId } = parseRequest(extractDocumentQuery, req.query);
      if (!Buffer.isBuffer(req.body)) throw new DocumentRejectedError('NOT_A_PDF');
      res.json(await service.extract(userIdOf(req), req.body, { phaseId, asOf: today() }));
    })
  );

  router.use('/documents', bodyErrors);
  return router;
}
