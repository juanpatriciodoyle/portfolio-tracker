// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { z } from 'zod';

/** Every error body is `{ error }`; a machine-readable `code` is added when the UI can act on it. */
export const apiErrorResponse = z.object({
  error: z.string(),
  code: z.string().optional(),
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponse>;

/** 400: the request body or query did not match its contract. Never echoes the offending values. */
export const validationErrorResponse = apiErrorResponse.extend({
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});
export type ValidationErrorResponse = z.infer<typeof validationErrorResponse>;

/** 409: the dates overlap another living phase of the same user. */
export const phaseOverlapErrorResponse = apiErrorResponse.extend({
  conflictingPhaseIds: z.array(z.string()),
});
export type PhaseOverlapErrorResponse = z.infer<typeof phaseOverlapErrorResponse>;

/** 503 with this code: the server has no field-encryption key, so profile data cannot be stored. */
export const ENCRYPTION_NOT_CONFIGURED = 'ENCRYPTION_NOT_CONFIGURED';
