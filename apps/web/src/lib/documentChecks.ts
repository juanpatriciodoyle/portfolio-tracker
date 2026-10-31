import { MAX_DOCUMENT_BYTES, type DocumentErrorCode } from '../contracts';

/** What the browser knows about a picked file. */
interface PickedFile {
  size: number;
  type: string;
  name: string;
}

/** Checks a picked file before anything is uploaded; returns why it cannot be read, or null when it can. */
export function checkDocument(file: PickedFile): DocumentErrorCode | null {
  const looksLikePdf = file.type === 'application/pdf' || (file.type === '' && /\.pdf$/i.test(file.name));
  if (!looksLikePdf || file.size === 0) return 'NOT_A_PDF';
  if (file.size > MAX_DOCUMENT_BYTES) return 'DOCUMENT_TOO_LARGE';
  return null;
}
