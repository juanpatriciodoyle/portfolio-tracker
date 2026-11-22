import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_PAGES, type DocumentErrorCode } from '../../contracts';
import type { MessageKey } from '../../i18n/catalogs';
import type { Words } from '../../lib/serverMessages';
import { currentWords } from '../../lib/serverMessages';
import type { ApiFailure } from '../../lib/apiErrors';
import { describeFailure } from './failureMessage';

const MAX_MB = MAX_DOCUMENT_BYTES / (1024 * 1024);

const SENTENCES: Record<DocumentErrorCode, MessageKey> = {
  NOT_A_PDF: 'doc.NOT_A_PDF',
  DOCUMENT_TOO_LARGE: 'doc.DOCUMENT_TOO_LARGE',
  TOO_MANY_PAGES: 'doc.TOO_MANY_PAGES',
  UNREADABLE_DOCUMENT: 'doc.UNREADABLE_DOCUMENT',
  EXTRACTION_BUSY: 'doc.EXTRACTION_BUSY',
  RATE_LIMITED: 'doc.RATE_LIMITED',
};

export function describeDocumentCode(code: DocumentErrorCode, { t }: Words = currentWords()): string {
  return t(SENTENCES[code], { mb: MAX_MB, pages: MAX_DOCUMENT_PAGES });
}

/** A sentence for a failed read or save in the review form. */
export function describeDocumentFailure(failure: ApiFailure, words: Words = currentWords()): string {
  if (failure.kind === 'document') return describeDocumentCode(failure.code, words);
  if (failure.kind === 'duplicate') return words.t('doc.duplicate');
  return describeFailure(failure, [], words);
}
