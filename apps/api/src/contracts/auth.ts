import { z } from 'zod';

/**
 * Why a sign-in, a passkey request or a demo request was refused. Every refusal carries its code next to the
 * English sentence, so the web app can word it in the language on screen without reading the sentence.
 */
export const SIGN_IN_ERROR_CODES = [
  'GOOGLE_TOKEN_NEEDED',
  'GOOGLE_TOKEN_UNVERIFIED',
  'GOOGLE_NOT_CONFIGURED',
  'GOOGLE_SIGN_IN_FAILED',
  'REGISTRATION_CLOSED',
  'TOO_MANY_ATTEMPTS',
  'PASSKEY_REQUEST_INVALID',
  'PASSKEY_CHALLENGE_EXPIRED',
  'PASSKEY_UNVERIFIED',
  'PASSKEY_UNKNOWN',
  'PASSKEY_START_FAILED',
  'PASSKEY_NOT_FOR_ADMIN',
  'PASSKEY_NOT_FOR_GUEST',
  'PASSKEY_ALREADY_ADDED',
  'DEMO_UNAVAILABLE',
  'DEMO_BUSY',
  'NOT_A_GUEST',
  'GUEST_SESSION_ENDED',
  'CAPTCHA_FAILED',
  'CAPTCHA_UNAVAILABLE',
] as const;
export const signInErrorCodeSchema = z.enum(SIGN_IN_ERROR_CODES);
export type SignInErrorCode = z.infer<typeof signInErrorCodeSchema>;

/**
 * The answer of the human check (hCaptcha) that `POST /api/auth/google` and `POST /api/auth/demo` carry when the
 * server has the check switched on (`GET /api/config` says so). Optional here because the server decides whether it is needed.
 */
export const captchaTokenSchema = z.string().min(1).max(8192);
export const captchaBodySchema = z.object({ captchaToken: captchaTokenSchema.optional() });

/** Who signed in, as the web app shows them. The email is only ever what Google confirmed in this very sign-in: a passkey sign-in has none. */
export const signedInUserSchema = z.object({
  id: z.string(),
  email: z.string().optional(),
  name: z.string(),
  avatarUrl: z.string().nullish(),
  country: z.string(),
  /** Only true after Google confirmed the administrator's email. It decides what is shown; the server decides what is allowed. */
  isAdmin: z.boolean(),
  /** A passkey is saved on this account, so the "add a passkey" action is not offered again. */
  hasPasskey: z.boolean(),
  /** The demo guest: an account that lasts one hour at most and is erased on sign-out. */
  isGuest: z.boolean(),
});
export type SignedInUserDto = z.infer<typeof signedInUserSchema>;

/** `POST /api/auth/google`, `/api/auth/passkey/sign-in/verify` and `/api/auth/demo`: the session the web app keeps. */
export const signInResponseSchema = z.object({
  success: z.literal(true),
  token: z.string().min(1),
  user: signedInUserSchema,
});
export type SignInResponse = z.infer<typeof signInResponseSchema>;

/** What the browser's passkey prompt needs. Its inner structure is the passkey library's to check. */
const passkeyOptionsSchema = z.looseObject({ challenge: z.string().min(1) });

/** `POST /api/auth/passkey/sign-in/options`: the question for a passkey sign-in, and the id to answer it with. */
export const passkeySignInOptionsResponse = z.object({ challengeId: z.string().min(1), options: passkeyOptionsSchema });
export type PasskeySignInOptionsResponse = z.infer<typeof passkeySignInOptionsResponse>;

/** `POST /api/auth/passkey/register/options`: the question for saving a passkey on the account that is signed in. */
export const passkeyRegistrationOptionsResponse = z.object({ options: passkeyOptionsSchema });
export type PasskeyRegistrationOptionsResponse = z.infer<typeof passkeyRegistrationOptionsResponse>;
