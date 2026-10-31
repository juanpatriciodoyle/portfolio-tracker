import { DocumentRejectedError } from '../application/errors';
import { extractBillingDraft } from '../domain/documentExtraction/extractBillingDraft';
import { WorkerPdfTextExtractor } from '../infrastructure/pdf/workerPdfTextExtractor';
import { buildPdf } from './support/syntheticPdf';

// Runs the real reader on small synthetic PDFs. No network, no files: the PDFs only exist in memory.
jest.setTimeout(30_000);

const extractor = new WorkerPdfTextExtractor({ maxPages: 15, timeoutMs: 20_000 });

describe('WorkerPdfTextExtractor', () => {
  it('reads the text of a page, line by line, with accents and the euro sign', async () => {
    const pdf = buildPdf([['IBERDROLA CLIENTES, S.A.U.', 'Período de facturación: del 15/07/2026 al 14/09/2026', 'TOTAL A PAGAR 96,50 €']]);

    const { pages, text } = await extractor.extract(pdf);

    expect(pages).toBe(1);
    expect(text.split('\n').map((line) => line.trim())).toEqual([
      'IBERDROLA CLIENTES, S.A.U.',
      'Período de facturación: del 15/07/2026 al 14/09/2026',
      'TOTAL A PAGAR 96,50 €',
    ]);
  });

  it('feeds the extraction engine end to end', async () => {
    const pdf = buildPdf([['Endesa Energía, S.A.U.', 'Factura de electricidad', 'Periodo de facturación: 01/09/2026 - 30/09/2026'], ['Importe total', '120,00 €']]);

    const { pages, text } = await extractor.extract(pdf);
    const { draft } = extractBillingDraft(text, { countryCode: 'ES', currency: 'EUR' });

    expect(pages).toBe(2);
    expect(draft).toMatchObject({ vendor: 'Endesa', category: 'ELECTRICITY', cadence: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-09-30', amountMinor: 12000, currency: 'EUR' });
  });

  it('answers no text for a page that is only a picture, as a scan is', async () => {
    const { pages, text } = await extractor.extract(buildPdf([[]]));

    expect(pages).toBe(1);
    expect(text.trim()).toBe('');
  });

  it('refuses a document with too many pages without reading any', async () => {
    const pdf = buildPdf(Array.from({ length: 16 }, (_, i) => [`Page ${i + 1}`]));

    await expect(extractor.extract(pdf)).rejects.toMatchObject({ code: 'TOO_MANY_PAGES' });
    await expect(extractor.extract(buildPdf(Array.from({ length: 15 }, () => ['x'])))).resolves.toMatchObject({ pages: 15 });
  });

  it('rejects bytes that only look like a PDF, naming no detail', async () => {
    const error = await extractor.extract(Buffer.from('%PDF-1.4\nthis is not really a pdf at all')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DocumentRejectedError);
    expect(error).toMatchObject({ code: 'UNREADABLE_DOCUMENT' });
  });

  it('gives up on a reader that does not answer in time, and stops it', async () => {
    const stuck = new WorkerPdfTextExtractor({ maxPages: 15, timeoutMs: 300, workerSource: 'setInterval(() => undefined, 1000);' });
    const started = Date.now();

    await expect(stuck.extract(buildPdf([['x']]))).rejects.toMatchObject({ code: 'UNREADABLE_DOCUMENT' });

    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('survives a reader that crashes', async () => {
    const crashing = new WorkerPdfTextExtractor({ maxPages: 15, timeoutMs: 5_000, workerSource: 'throw new Error("boom");' });

    await expect(crashing.extract(buildPdf([['x']]))).rejects.toMatchObject({ code: 'UNREADABLE_DOCUMENT' });
  });

  it('leaves the caller’s bytes untouched', async () => {
    const pdf = buildPdf([['hello']]);
    const before = Buffer.from(pdf);

    await extractor.extract(pdf);

    expect(pdf.equals(before)).toBe(true);
  });
});
