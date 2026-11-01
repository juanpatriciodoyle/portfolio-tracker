import { salary } from './support/income';
import express from 'express';
import request from 'supertest';
import type { PdfTextExtractor } from '../application/ports';
import { DocumentRejectedError } from '../application/errors';
import { DOCUMENT_ERROR_CODES, extractionResponse, MAX_DOCUMENT_BYTES } from '../contracts';
import { generateToken } from '../lib/auth';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { buildProfileFeature } from '../routes/profileFeature';
import { InMemoryBillingRecordRepository, InMemoryLivingPhaseRepository, InMemoryProfileRepository } from './support/inMemoryRepositories';

const BILL_TEXT = ['Endesa Energía, S.A.U.', 'Factura de electricidad', 'Periodo de facturación: 01/09/2026 - 30/09/2026', 'Total a pagar 96,50 €'].join('\n');
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 0x20)]);

const madrid = {
  name: 'Madrid',
  city: 'Madrid',
  countryCode: 'ES',
  tenure: 'RENT',
  startDate: '2022-09-01',
  currency: 'EUR',
  incomeStreams: salary(1),
};

function build(extractor?: Partial<PdfTextExtractor>, limits?: { limit?: number }) {
  const livingPhaseRepository = new InMemoryLivingPhaseRepository();
  const extract = jest.fn(async (_pdf: Uint8Array) => ({ pages: 1, text: BILL_TEXT }));
  let ids = 0;
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    ...buildProfileFeature({
      cipher: new AesGcmFieldCipher(Buffer.alloc(32, 4)),
      fingerprinter: new HmacBillFingerprinter(Buffer.alloc(32, 4)),
      livingPhaseRepository,
      profileRepository: new InMemoryProfileRepository(),
      billingRecordRepository: new InMemoryBillingRecordRepository(livingPhaseRepository),
      pdfTextExtractor: { extract, ...extractor },
      documentLimits: { limit: limits?.limit ?? 100 },
      today: () => '2026-10-31',
      newId: () => `id-${++ids}`,
    })
  );
  return { app, extract };
}

const ALICE = { Authorization: `Bearer ${generateToken('alice')}` };
const upload = (app: express.Express, body: Buffer | string = PDF, type = 'application/pdf', headers: Record<string, string> = ALICE) =>
  request(app).post('/api/documents/extract').set(headers).set('Content-Type', type).send(body);

describe('POST /api/documents/extract', () => {
  it('reads the PDF sent as the raw body and answers with the draft', async () => {
    const { app, extract } = build();
    const { body: created } = await request(app).post('/api/living-phases').set(ALICE).send(madrid);

    const response = await upload(app);

    expect(response.status).toBe(200);
    expect(extractionResponse.parse(response.body)).toMatchObject({
      textFound: true,
      pages: 1,
      suggestedPhaseId: created.id,
      draft: { amountMinor: 9650, currency: 'EUR', vendor: 'Endesa', category: 'ELECTRICITY', cadence: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-09-30' },
    });
    expect(Buffer.from(extract.mock.calls[0][0] as Uint8Array).equals(PDF)).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('Factura de electricidad');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('needs a token, and a token in the URL or a userId do not count', async () => {
    const { app, extract } = build();

    expect((await upload(app, PDF, 'application/pdf', {})).status).toBe(401);
    expect((await upload(app, PDF, 'application/pdf', { Authorization: 'Bearer nope' })).status).toBe(403);
    expect((await request(app).post(`/api/documents/extract?token=${generateToken('alice')}&userId=alice`).set('Content-Type', 'application/pdf').send(PDF)).status).toBe(401);
    expect(extract).not.toHaveBeenCalled();
  });

  it('uses a phase of the person for hints, and 404s on someone else’s', async () => {
    const { app } = build();
    const { body: created } = await request(app).post('/api/living-phases').set(ALICE).send(madrid);

    expect((await request(app).post(`/api/documents/extract?phaseId=${created.id}`).set(ALICE).set('Content-Type', 'application/pdf').send(PDF)).status).toBe(200);
    const bob = { Authorization: `Bearer ${generateToken('bob')}` };
    expect((await request(app).post(`/api/documents/extract?phaseId=${created.id}`).set(bob).set('Content-Type', 'application/pdf').send(PDF)).status).toBe(404);
  });

  it('rejects anything that is not sent as a PDF', async () => {
    const { app, extract } = build();

    for (const [body, type] of [
      [PDF, 'application/octet-stream'],
      [Buffer.from('{"pdf":true}'), 'application/json'],
      [Buffer.from('<html></html>'), 'application/pdf'],
      [Buffer.alloc(0), 'application/pdf'],
    ] as const) {
      const response = await upload(app, body as Buffer, type);
      expect(response.status).toBe(415);
      expect(response.body).toMatchObject({ code: 'NOT_A_PDF' });
    }
    expect(extract).not.toHaveBeenCalled();
  });

  it('rejects a document over 5 MB with 413 before reading it', async () => {
    const { app, extract } = build();
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(MAX_DOCUMENT_BYTES, 0x20)]);

    const response = await upload(app, big);

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
    expect(extract).not.toHaveBeenCalled();
  });

  it.each([
    ['TOO_MANY_PAGES', 422],
    ['UNREADABLE_DOCUMENT', 422],
    ['EXTRACTION_BUSY', 503],
  ] as const)('maps %s to %i with its code', async (code, status) => {
    const { app } = build({
      extract: async () => {
        throw new DocumentRejectedError(code);
      },
    });

    const response = await upload(app);

    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ code });
    expect(DOCUMENT_ERROR_CODES).toContain(response.body.code);
  });

  it('answers 429 with Retry-After once a person reads too many documents', async () => {
    const { app } = build({}, { limit: 1 });
    await upload(app);

    const response = await upload(app);

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keeps an unexpected failure generic', async () => {
    const { app } = build({
      extract: async () => {
        throw new Error('disk full at /var/secret');
      },
    });

    const response = await upload(app);

    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});
