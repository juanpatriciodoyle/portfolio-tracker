import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_PAGES, type DocumentErrorCode } from '../../contracts';
import type { ApiFailure } from '../../lib/apiErrors';
import { describeFailure } from './failureMessage';

const MAX_MB = MAX_DOCUMENT_BYTES / (1024 * 1024);

const SENTENCES: Record<DocumentErrorCode, string> = {
  NOT_A_PDF: 'That file is not a PDF. Pick the PDF of your bill, or log the bill by hand.',
  DOCUMENT_TOO_LARGE: `That PDF is larger than ${MAX_MB} MB. Pick a smaller file, or log the bill by hand.`,
  TOO_MANY_PAGES: `That PDF has more than ${MAX_DOCUMENT_PAGES} pages, which is too long for a bill. Pick the bill itself, or log it by hand.`,
  UNREADABLE_DOCUMENT: 'We could not open that PDF. It may be damaged or protected with a password. Try another copy, or log the bill by hand.',
  EXTRACTION_BUSY: 'Reading bills is busy right now. Wait a moment and try again.',
  RATE_LIMITED: 'You have sent several bills in a row. Wait a minute and try again.',
};

export function describeDocumentCode(code: DocumentErrorCode): string {
  return SENTENCES[code];
}

/** A sentence for a failed read or save in the review form. */
export function describeDocumentFailure(failure: ApiFailure): string {
  if (failure.kind === 'document') return describeDocumentCode(failure.code);
  if (failure.kind === 'duplicate') return 'This bill is already recorded. Nothing was added, so you can close this and check your bills.';
  return describeFailure(failure);
}
