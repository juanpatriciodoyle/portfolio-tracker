// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { z } from 'zod';
import { apiErrorResponse } from './errors';

/** The four kinds of transaction. The words are the same in the database, the API and the screens. */
export const TRANSACTION_TYPES = ['BOUGHT', 'SOLD', 'DEPOSIT', 'WITHDRAWAL'] as const;
export const transactionType = z.enum(TRANSACTION_TYPES);
export type TransactionType = z.infer<typeof transactionType>;

const finiteNumber = z.coerce.number().refine(Number.isFinite, 'must be a number');

/**
 * `POST /api/transactions`. The older clients send numbers as strings, so numbers are coerced here once and trusted afterwards.
 * `paidWithCash` only means something for a buy: it draws on the cash the person holds instead of bringing new money, and it is
 * refused (`INSUFFICIENT_CASH`) when there is not enough. Left out, a buy brings new money.
 */
export const recordTransactionRequest = z.object({
  type: transactionType,
  symbol: z.string().trim().max(40).optional(),
  name: z.string().max(200).optional(),
  assetClass: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
  sector: z.string().max(60).optional(),
  quantity: finiteNumber.optional(),
  amount: finiteNumber,
  fee: finiteNumber.optional(),
  currency: z.string().max(10).optional(),
  notes: z.string().max(2000).optional(),
  date: z
    .string()
    .max(40)
    .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a date')
    .optional(),
  paidWithCash: z.boolean().default(false),
});
export type RecordTransactionRequest = z.input<typeof recordTransactionRequest>;

/** 400 with this code: a purchase paid with cash needs more cash than the person holds in that currency. */
export const INSUFFICIENT_CASH = 'INSUFFICIENT_CASH';
export const insufficientCashErrorResponse = apiErrorResponse.extend({
  code: z.literal(INSUFFICIENT_CASH),
  currency: z.string(),
  /** What the person holds in `currency`, in minor units (cents). */
  availableMinor: z.number().int(),
});
export type InsufficientCashErrorResponse = z.infer<typeof insufficientCashErrorResponse>;

/**
 * `PATCH /api/transactions/:id`. Only what the person can correct: when it happened, how many units, what it cost, the fee, how it was
 * paid and the note. What was traded (the instrument) and what kind of transaction it was never change: delete it and log it again.
 * At least one field is needed; the rest stay as they are.
 */
export const updateTransactionRequest = z
  .object({
    date: z
      .string()
      .max(40)
      .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a date')
      .optional(),
    quantity: finiteNumber.pipe(z.number().positive()).optional(),
    amount: finiteNumber.pipe(z.number().positive()).optional(),
    fee: finiteNumber.pipe(z.number().min(0)).optional(),
    paidWithCash: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined), 'nothing to change');
export type UpdateTransactionRequest = z.input<typeof updateTransactionRequest>;

/** 409 with this code: the change would break a later transaction that depends on this one. */
export const TRANSACTION_REQUIRED_BY_LATER = 'TRANSACTION_REQUIRED_BY_LATER';
export const transactionRequiredByLaterErrorResponse = apiErrorResponse.extend({
  code: z.literal(TRANSACTION_REQUIRED_BY_LATER),
  /** The later transaction that would no longer hold: a sale without the units, or a cash purchase without the cash. */
  dependent: z.object({
    id: z.string(),
    type: transactionType,
    symbol: z.string(),
    /** Calendar day, `YYYY-MM-DD`. */
    date: z.string(),
  }),
});
export type TransactionRequiredByLaterErrorResponse = z.infer<typeof transactionRequiredByLaterErrorResponse>;
