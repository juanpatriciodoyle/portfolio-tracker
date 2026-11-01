import { salary } from './support/income';
import { DocumentExtractionService } from '../application/documentExtractionService';
import { DocumentRejectedError, ResourceNotFoundError } from '../application/errors';
import { ConcurrencyGate, SlidingWindowRateLimiter } from '../application/limits';
import { LivingPhaseService } from '../application/livingPhaseService';
import type { PdfTextExtractor } from '../application/ports';
import { extractionResponse, MAX_DOCUMENT_BYTES, createLivingPhaseRequest } from '../contracts';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { InMemoryLivingPhaseRepository } from './support/inMemoryRepositories';

const USER = 'user-1';
const BILL_TEXT = ['IBERDROLA CLIENTES, S.A.U.', 'Factura de electricidad', 'Periodo de facturación: del 15/07/2024 al 14/09/2024', 'TOTAL A PAGAR 96,50 €'].join('\n');
const pdf = (size = 100) => {
  const bytes = Buffer.alloc(size, 0x20);
  bytes.write('%PDF-1.7\n', 0);
  return bytes;
};

const phase = (name: string, change: Record<string, unknown>) =>
  createLivingPhaseRequest.parse({ name, city: name, countryCode: 'ES', tenure: 'RENT', startDate: '2022-09-01', currency: 'EUR', incomeStreams: salary(1), ...change });

async function build(extractor: Partial<PdfTextExtractor> = {}, options: { limit?: number; slots?: number } = {}) {
  let ids = 0;
  const repository = new InMemoryLivingPhaseRepository();
  const phases = new LivingPhaseService({ repository, cipher: new AesGcmFieldCipher(Buffer.alloc(32, 2)), newId: () => `id-${++ids}` });
  const { id: madrid } = await phases.createPhase(USER, phase('Madrid', { endDate: '2024-12-31' }));
  const { id: buenosAires } = await phases.createPhase(USER, phase('Buenos Aires', { countryCode: 'AR', currency: 'ARS', startDate: '2025-01-01' }));
  const extract = jest.fn(async () => ({ pages: 2, text: BILL_TEXT }));
  const service = new DocumentExtractionService({
    extractor: { extract, ...extractor },
    phases,
    limiter: new SlidingWindowRateLimiter({ limit: options.limit ?? 100, windowMs: 60_000, now: () => 0 }),
    gate: new ConcurrencyGate(options.slots ?? 2),
  });
  return { service, extract, madrid, buenosAires };
}

describe('DocumentExtractionService', () => {
  it('answers with a draft that fits the contract, the page count and the phase the bill period falls in', async () => {
    const { service, madrid } = await build();

    const result = await service.extract(USER, pdf(), { asOf: '2026-10-31' });

    expect(extractionResponse.parse(result)).toEqual({
      draft: {
        amountMinor: 9650,
        currency: 'EUR',
        vendor: 'Iberdrola',
        category: 'ELECTRICITY',
        cadence: 'BIMONTHLY',
        periodStart: '2024-07-15',
        periodEnd: '2024-09-14',
      },
      textFound: true,
      pages: 2,
      suggestedPhaseId: madrid,
    });
  });

  it('never returns the text of the document', async () => {
    const { service } = await build();

    expect(JSON.stringify(await service.extract(USER, pdf(), { asOf: '2026-10-31' }))).not.toContain('Factura de electricidad');
  });

  it('reads dates with the country of the phase it was opened from', async () => {
    const text = 'Endesa\nPeriodo: 03/04/2026 - 04/05/2026\nTotal a pagar 50,00 €';
    const { service, buenosAires } = await build({ extract: async () => ({ pages: 1, text }) });

    const withPhase = await service.extract(USER, pdf(), { phaseId: buenosAires, asOf: '2026-10-31' });

    expect(withPhase.draft).toMatchObject({ periodStart: '2026-04-03', periodEnd: '2026-05-04' });
    expect(withPhase.suggestedPhaseId).toBe(buenosAires);
  });

  it('uses the phase that is current today for hints when none is given, and suggests it when the bill has no period', async () => {
    const text = 'Edenor\nTotal a pagar $ 1.500,00';
    const { service, buenosAires } = await build({ extract: async () => ({ pages: 1, text }) });

    const result = await service.extract(USER, pdf(), { asOf: '2026-10-31' });

    expect(result.draft).toMatchObject({ amountMinor: 150000, currency: 'ARS' });
    expect(result.suggestedPhaseId).toBe(buenosAires);
  });

  it('returns an empty draft, not an error, for a PDF without text', async () => {
    const { service } = await build({ extract: async () => ({ pages: 3, text: '' }) });

    const result = await service.extract(USER, pdf(), { asOf: '2026-10-31' });

    expect(result).toMatchObject({ textFound: false, pages: 3, draft: { amountMinor: null, vendor: null, periodStart: null } });
  });

  it('cannot use a phase that is missing or someone else’s', async () => {
    const { service, extract } = await build();

    await expect(service.extract(USER, pdf(), { phaseId: 'nope', asOf: '2026-10-31' })).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.extract('user-2', pdf(), { phaseId: 'id-1', asOf: '2026-10-31' })).rejects.toBeInstanceOf(ResourceNotFoundError);
    expect(extract).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', Buffer.alloc(0)],
    ['not a PDF', Buffer.from('PK\u0003\u0004 this is a zip')],
    ['text file', Buffer.from('%PD-1.4 nearly')],
  ])('rejects a %s before reading it', async (_name, bytes) => {
    const { service, extract } = await build();

    await expect(service.extract(USER, bytes, { asOf: '2026-10-31' })).rejects.toMatchObject({ code: 'NOT_A_PDF' });
    expect(extract).not.toHaveBeenCalled();
  });

  it('accepts a PDF whose header is not at the very first byte, as some generators emit', async () => {
    const { service } = await build();

    await expect(service.extract(USER, Buffer.concat([Buffer.from('\n\n'), pdf()]), { asOf: '2026-10-31' })).resolves.toBeDefined();
  });

  it('rejects a document over the size limit without reading it', async () => {
    const { service, extract } = await build();

    await expect(service.extract(USER, pdf(MAX_DOCUMENT_BYTES + 1), { asOf: '2026-10-31' })).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
    expect(extract).not.toHaveBeenCalled();
  });

  it('passes on what the reader rejects: too many pages, damaged or locked files', async () => {
    const { service } = await build({
      extract: async () => {
        throw new DocumentRejectedError('TOO_MANY_PAGES');
      },
    });

    await expect(service.extract(USER, pdf(), { asOf: '2026-10-31' })).rejects.toMatchObject({ code: 'TOO_MANY_PAGES' });
  });

  it('turns any other failure of the reader into "unreadable", never a stack trace', async () => {
    const { service } = await build({
      extract: async () => {
        throw new Error('boom: /secret/path');
      },
    });

    const error = await service.extract(USER, pdf(), { asOf: '2026-10-31' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DocumentRejectedError);
    expect(error).toMatchObject({ code: 'UNREADABLE_DOCUMENT' });
    expect(String((error as Error).message)).not.toContain('secret');
  });

  it('limits how often one person can read documents, saying when to retry', async () => {
    const { service, extract } = await build({}, { limit: 2 });
    await service.extract(USER, pdf(), { asOf: '2026-10-31' });
    await service.extract(USER, pdf(), { asOf: '2026-10-31' });

    await expect(service.extract(USER, pdf(), { asOf: '2026-10-31' })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 60 });
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it('refuses new work while the readers are all busy, and frees a place afterwards', async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => (release = resolve));
    const { service } = await build({ extract: async () => (await slow, { pages: 1, text: BILL_TEXT }) }, { slots: 1 });

    const first = service.extract(USER, pdf(), { asOf: '2026-10-31' });
    await expect(service.extract(USER, pdf(), { asOf: '2026-10-31' })).rejects.toMatchObject({ code: 'EXTRACTION_BUSY' });
    release();
    await first;

    await expect(service.extract(USER, pdf(), { asOf: '2026-10-31' })).resolves.toBeDefined();
  });

  it('frees its place even when the reader fails', async () => {
    const { service } = await build({ extract: async () => Promise.reject(new Error('x')) }, { slots: 1 });

    await service.extract(USER, pdf(), { asOf: '2026-10-31' }).catch(() => undefined);

    await expect(service.extract(USER, pdf(), { asOf: '2026-10-31' })).rejects.toMatchObject({ code: 'UNREADABLE_DOCUMENT' });
  });
});
