import { describe, expect, it } from 'vitest';
import { DOCUMENT_ERROR_CODES, MAX_DOCUMENT_PAGES } from '../../../contracts';
import { describeDocumentCode, describeDocumentFailure } from '../describeDocument';

describe('describeDocumentCode', () => {
  it('has a plain sentence for every code, with no codes or jargon', () => {
    for (const code of DOCUMENT_ERROR_CODES) {
      const text = describeDocumentCode(code);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/[A-Z]{4,}_[A-Z]+|HTTP|\b4\d\d\b|\b5\d\d\b/);
    }
  });

  it('names the limits', () => {
    expect(describeDocumentCode('DOCUMENT_TOO_LARGE')).toContain('5 MB');
    expect(describeDocumentCode('TOO_MANY_PAGES')).toContain(String(MAX_DOCUMENT_PAGES));
  });
});

describe('describeDocumentFailure', () => {
  it('uses the code sentence for document failures', () => {
    expect(describeDocumentFailure({ kind: 'document', code: 'NOT_A_PDF', message: 'raw' })).toBe(describeDocumentCode('NOT_A_PDF'));
  });

  it('explains a duplicate bill', () => {
    expect(describeDocumentFailure({ kind: 'duplicate', message: 'raw', existingRecordId: 'b1' })).toMatch(/already recorded/i);
  });

  it('falls back to the failure message for anything else', () => {
    expect(describeDocumentFailure({ kind: 'network', message: 'Could not reach the server.' })).toBe('Could not reach the server.');
  });
});
