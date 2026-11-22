// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { z } from 'zod';

/** `GET /api/config`: what the sign-in screen needs to know before anyone is signed in. Public, and nothing secret. */
export const appConfigResponse = z.object({
  /** Whether the "sneak peek" guest account exists on this server. */
  demoEnabled: z.boolean(),
});
export type AppConfigResponse = z.infer<typeof appConfigResponse>;
