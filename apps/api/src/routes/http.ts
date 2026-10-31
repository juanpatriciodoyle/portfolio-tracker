import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { DocumentRejectedError, ResourceNotFoundError } from '../application/errors';
import { DUPLICATE_BILLING_RECORD } from '../contracts';
import type { ApiErrorResponse, DuplicateBillingRecordErrorResponse, PhaseOverlapErrorResponse, ValidationErrorResponse } from '../contracts';
import { DuplicateBillingRecordError, InvalidBillingRecordError, InvalidLivingPhaseError, InvalidProfileError, PhaseOverlapError } from '../domain/errors';
import { verifyToken, type AuthenticatedRequest } from '../lib/auth';

/** A request body, query or parameter that does not match its contract. Carries paths and rules, never values. */
export class RequestValidationError extends Error {
  constructor(readonly issues: ValidationErrorResponse['issues']) {
    super('Invalid request');
    this.name = 'RequestValidationError';
  }
}

/** Parse, don't validate: turns untrusted input into a typed value, or fails with a RequestValidationError. */
export function parseRequest<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new RequestValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    );
  }
  return result.data;
}

/**
 * Who is asking comes from the signed token and nowhere else: not from a `userId` in the query or
 * body, and not from a token in the URL (URLs end up in logs).
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Access denied. Authentication token required.' } satisfies ApiErrorResponse);
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(403).json({ error: 'Invalid or expired authentication token.' } satisfies ApiErrorResponse);
    return;
  }

  (req as AuthenticatedRequest).userId = decoded.userId;
  next();
}

/** Responses here hold personal data: browsers and proxies must not keep copies. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'no-store');
  next();
}

export const userIdOf = (req: Request): string => (req as AuthenticatedRequest).userId as string;

/** Wraps an async handler so every failure ends up in `respondWithError`. */
export function handle(action: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res) => {
    action(req, res).catch((error: unknown) => respondWithError(error, res));
  };
}

const DOCUMENT_STATUS: Record<DocumentRejectedError['code'], number> = {
  NOT_A_PDF: 415,
  DOCUMENT_TOO_LARGE: 413,
  TOO_MANY_PAGES: 422,
  UNREADABLE_DOCUMENT: 422,
  EXTRACTION_BUSY: 503,
  RATE_LIMITED: 429,
};

export function respondWithError(error: unknown, res: Response): void {
  if (error instanceof RequestValidationError) {
    res.status(400).json({ error: 'Invalid request', issues: error.issues } satisfies ValidationErrorResponse);
  } else if (error instanceof ResourceNotFoundError) {
    res.status(404).json({ error: error.message } satisfies ApiErrorResponse);
  } else if (error instanceof PhaseOverlapError) {
    res
      .status(409)
      .json({ error: error.message, conflictingPhaseIds: [...error.conflictingPhaseIds] } satisfies PhaseOverlapErrorResponse);
  } else if (error instanceof DocumentRejectedError) {
    if (error.retryAfterSeconds !== undefined) res.set('Retry-After', String(error.retryAfterSeconds));
    res.status(DOCUMENT_STATUS[error.code]).json({ error: error.message, code: error.code } satisfies ApiErrorResponse);
  } else if (error instanceof DuplicateBillingRecordError) {
    res
      .status(409)
      .json({ error: error.message, code: DUPLICATE_BILLING_RECORD, existingRecordId: error.existingRecordId } satisfies DuplicateBillingRecordErrorResponse);
  } else if (
    error instanceof InvalidLivingPhaseError ||
    error instanceof InvalidBillingRecordError ||
    error instanceof InvalidProfileError
  ) {
    res.status(422).json({ error: error.message } satisfies ApiErrorResponse);
  } else {
    // Only the kind of failure is logged: never request bodies, never decrypted data.
    console.error('Unexpected error in profile feature:', error instanceof Error ? error.name : 'unknown');
    res.status(500).json({ error: 'Internal server error' } satisfies ApiErrorResponse);
  }
}
