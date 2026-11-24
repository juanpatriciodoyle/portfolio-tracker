// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.
import { z } from 'zod';

/** `GET /api/config`: what the sign-in screen needs to know before anyone is signed in. Public, and nothing secret. */
export const appConfigResponse = z.object({
  /** Whether "Try the demo" exists on this server. */
  demoEnabled: z.boolean(),
  /** The public site key of the human check shown before Google sign-in and the demo; null when the server does not ask for one. */
  captchaSiteKey: z.string().min(1).nullable(),
});
export type AppConfigResponse = z.infer<typeof appConfigResponse>;
