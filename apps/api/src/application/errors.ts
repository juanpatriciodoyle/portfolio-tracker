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
