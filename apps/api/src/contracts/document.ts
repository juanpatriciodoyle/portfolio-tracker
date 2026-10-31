import { z } from 'zod';
import { apiErrorResponse } from './errors';
import { fixedCostCategorySchema } from './fixedCost';
import { billingCadenceSchema } from './billingRecord';
import { amountMinorSchema, calendarDateSchema, currencyCodeSchema } from './primitives';

/** A bill document is read in memory only; these are the limits it must fit. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 15;

/**
 * What could be read from a bill. Every field is `null` when the document did not say it clearly:
 * nothing is guessed, and the review form leaves a blank field mandatory.
 */
export const billingDraftSchema = z.object({
  amountMinor: amountMinorSchema.positive().nullable(),
  currency: currencyCodeSchema.nullable(),
  vendor: z.string().min(1).max(80).nullable(),
  category: fixedCostCategorySchema.nullable(),
  cadence: billingCadenceSchema.nullable(),
  periodStart: calendarDateSchema.nullable(),
  periodEnd: calendarDateSchema.nullable(),
});
export type BillingDraft = z.infer<typeof billingDraftSchema>;

export const extractDocumentQuery = z.object({ phaseId: z.string().min(1).max(100).optional() });

/** The answer to `POST /api/documents/extract` (the body is the raw PDF, `Content-Type: application/pdf`). */
export const extractionResponse = z.object({
  draft: billingDraftSchema,
  /** False for a scanned or image-only PDF: no text layer, so the draft is empty. */
  textFound: z.boolean(),
  pages: z.number().int().min(1),
  /** The living phase the bill most likely belongs to (the one covering its period), or null. */
  suggestedPhaseId: z.string().nullable(),
});
export type ExtractionResponse = z.infer<typeof extractionResponse>;

/** Codes the review form can act on. */
export const DOCUMENT_ERROR_CODES = ['NOT_A_PDF', 'DOCUMENT_TOO_LARGE', 'TOO_MANY_PAGES', 'UNREADABLE_DOCUMENT', 'EXTRACTION_BUSY', 'RATE_LIMITED'] as const;
export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[number];

/** 409: this bill (same phase, vendor, category, period and amount) is already recorded. */
export const DUPLICATE_BILLING_RECORD = 'DUPLICATE_BILLING_RECORD';
export const duplicateBillingRecordErrorResponse = apiErrorResponse.extend({
  code: z.literal(DUPLICATE_BILLING_RECORD),
  existingRecordId: z.string(),
});
export type DuplicateBillingRecordErrorResponse = z.infer<typeof duplicateBillingRecordErrorResponse>;
