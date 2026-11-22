import { z } from 'zod';
import { calendarDateSchema } from './primitives';

/** A customer counts as active when they signed in within this many months. */
export const ACTIVE_CUSTOMER_MONTHS = 3;

/** `GET /api/admin/analytics`: how many people use the app. Only the admin may ask; everyone else gets 403. */
export const usageAnalyticsResponse = z.object({
  /** Customers with an account. The demo guest is not a customer. */
  registered: z.number().int().nonnegative(),
  /** Of those, how many signed in during the last `ACTIVE_CUSTOMER_MONTHS` months. */
  active: z.number().int().nonnegative(),
  /** `active` out of `registered`, from 0 to 100 with one decimal; 0 when nobody is registered. */
  activePercent: z.number().min(0).max(100),
  /** The first day of the window that counts as recent, and the day the figures were taken. */
  activeSince: calendarDateSchema,
  asOf: calendarDateSchema,
});
export type UsageAnalyticsResponse = z.infer<typeof usageAnalyticsResponse>;
