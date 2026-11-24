import type { SignInErrorCode } from '../contracts';

/** Something the caller asked for does not exist for them (or belongs to someone else: the two look identical). */
export class ResourceNotFoundError extends Error {
  constructor(readonly resource: string) {
    super(`${resource} not found`);
    this.name = 'ResourceNotFoundError';
  }
}

const DOCUMENT_MESSAGES = {
  NOT_A_PDF: 'The file is not a PDF document.',
  DOCUMENT_TOO_LARGE: 'The PDF is larger than the 5 MB limit.',
  TOO_MANY_PAGES: 'The PDF has more than 15 pages.',
  UNREADABLE_DOCUMENT: 'The PDF could not be read. It may be damaged or password-protected.',
  EXTRACTION_BUSY: 'Too many documents are being read right now. Try again in a moment.',
  RATE_LIMITED: 'Too many documents in a short time. Try again shortly.',
} as const;

export type DocumentRejection = keyof typeof DOCUMENT_MESSAGES;

/** A document that was not read, and why. Never carries any content of the document. */
export class DocumentRejectedError extends Error {
  constructor(
    readonly code: DocumentRejection,
    readonly retryAfterSeconds?: number
  ) {
    super(DOCUMENT_MESSAGES[code]);
    this.name = 'DocumentRejectedError';
  }
}

/** The sentence for every refusal, in English. The code travels with it so the web app can say it in its own language. */
const SIGN_IN_MESSAGES: Record<SignInErrorCode, string> = {
  GOOGLE_TOKEN_NEEDED: 'Google did not send a sign-in token. Try signing in again.',
  GOOGLE_TOKEN_UNVERIFIED: 'Google could not confirm your sign-in. Try signing in again.',
  GOOGLE_NOT_CONFIGURED: 'Google sign-in is not set up on this server.',
  GOOGLE_SIGN_IN_FAILED: 'Google sign-in failed on our side. Try again in a moment.',
  REGISTRATION_CLOSED: 'New accounts are closed right now. Ask the owner of this app for access.',
  TOO_MANY_ATTEMPTS: 'Too many sign-in attempts. Wait a moment and try again.',
  PASSKEY_REQUEST_INVALID: 'The passkey request was not complete. Try again.',
  PASSKEY_CHALLENGE_EXPIRED: 'The passkey prompt took too long. Try again.',
  PASSKEY_UNVERIFIED: 'The passkey could not be verified. Try again, or sign in with Google.',
  PASSKEY_UNKNOWN: 'No account has this passkey. Sign in with Google, then add a passkey from your account.',
  PASSKEY_START_FAILED: 'Could not start the passkey prompt. Try again in a moment.',
  PASSKEY_NOT_FOR_ADMIN: 'This account signs in with Google only.',
  PASSKEY_NOT_FOR_GUEST: 'The demo cannot save a passkey. Sign in with Google to keep one.',
  PASSKEY_ALREADY_ADDED: 'This account already has a passkey.',
  DEMO_UNAVAILABLE: 'The demo could not be prepared right now. Try again in a moment, or sign in with Google.',
  DEMO_BUSY: 'The demo is busy right now. Try again in a few minutes.',
  NOT_A_GUEST: 'Only a demo session can be ended this way. Your own data was not touched.',
  GUEST_SESSION_ENDED: 'Your demo session has ended. Start a new one to keep exploring.',
};

export type SignInRejection = SignInErrorCode;

/** A sign-in (or passkey, or demo) request that was not accepted, and why. */
export class SignInRejectedError extends Error {
  constructor(readonly code: SignInRejection) {
    super(SIGN_IN_MESSAGES[code]);
    this.name = 'SignInRejectedError';
  }
}

/** The server has no Google client to check tokens against. Without one nothing can be verified, so nothing is accepted. */
export class GoogleNotConfiguredError extends Error {
  constructor() {
    super('GOOGLE_CLIENT_ID is not set');
    this.name = 'GoogleNotConfiguredError';
  }
}

/** The person is signed in but this is not theirs to see. */
export class ForbiddenError extends Error {
  constructor() {
    super('Only the administrator can see this.');
    this.name = 'ForbiddenError';
  }
}
