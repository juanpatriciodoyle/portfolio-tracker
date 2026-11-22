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

const SIGN_IN_MESSAGES = {
  GOOGLE_TOKEN_UNVERIFIED: 'Google could not confirm your sign-in. Try signing in again.',
  GOOGLE_NOT_CONFIGURED: 'Google sign-in is not set up on this server. Use a passkey.',
  PASSKEY_NEEDS_SIGN_IN: 'This account was created with Google. Sign in with Google first.',
} as const;

export type SignInRejection = keyof typeof SIGN_IN_MESSAGES;

/** A sign-in that was not accepted, and why. */
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
