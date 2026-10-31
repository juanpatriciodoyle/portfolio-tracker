import { describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_BYTES } from '../../contracts';
import { checkDocument } from '../documentChecks';

const file = (size: number, type = 'application/pdf', name = 'bill.pdf') => ({ size, type, name });

describe('checkDocument', () => {
  it('accepts a PDF within the size limit', () => {
    expect(checkDocument(file(1000))).toBeNull();
    expect(checkDocument(file(MAX_DOCUMENT_BYTES))).toBeNull();
  });

  it('accepts a .pdf whose type the browser left empty', () => {
    expect(checkDocument(file(1000, '', 'Factura.PDF'))).toBeNull();
  });

  it('rejects other file types', () => {
    expect(checkDocument(file(1000, 'image/png', 'scan.png'))).toBe('NOT_A_PDF');
    expect(checkDocument(file(1000, '', 'notes.txt'))).toBe('NOT_A_PDF');
  });

  it('rejects an empty file as not a PDF', () => {
    expect(checkDocument(file(0))).toBe('NOT_A_PDF');
  });

  it('rejects a file over the limit', () => {
    expect(checkDocument(file(MAX_DOCUMENT_BYTES + 1))).toBe('DOCUMENT_TOO_LARGE');
  });
});
