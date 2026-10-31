import { extractBillingDraft, EMPTY_DRAFT } from '../domain/documentExtraction/extractBillingDraft';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', 'bills', name), 'utf8');

const SPAIN = { countryCode: 'ES', currency: 'EUR' };
const ARGENTINA = { countryCode: 'AR', currency: 'ARS' };

describe('extractBillingDraft: synthetic bills', () => {
  it('reads a Spanish electricity bill completely', () => {
    expect(extractBillingDraft(fixture('es-electricity.txt'), SPAIN)).toEqual({
      textFound: true,
      draft: {
        amountMinor: 9650,
        currency: 'EUR',
        vendor: 'Iberdrola',
        category: 'ELECTRICITY',
        cadence: 'BIMONTHLY',
        periodStart: '2026-07-15',
        periodEnd: '2026-09-14',
      },
    });
  });

  it('reads an Argentine bill whose dollar sign means pesos, using the phase for that and nothing else', () => {
    const { draft } = extractBillingDraft(fixture('ar-electricity.txt'), ARGENTINA);

    expect(draft).toEqual({
      amountMinor: 4532050,
      currency: 'ARS',
      vendor: 'Edenor',
      category: 'ELECTRICITY',
      cadence: 'BIMONTHLY',
      periodStart: '2026-08-01',
      periodEnd: '2026-09-30',
    });
  });

  it('leaves the currency blank for a bare dollar sign when the phase does not use one', () => {
    const { draft } = extractBillingDraft(fixture('ar-electricity.txt'), SPAIN);

    expect(draft.currency).toBeNull();
    expect(draft.amountMinor).toBe(4532050);
  });

  it('reads a US cable bill with month-first dates and a dollar total', () => {
    const { draft } = extractBillingDraft(fixture('us-internet.txt'), { countryCode: 'US', currency: 'USD' });

    expect(draft).toMatchObject({
      amountMinor: 12999,
      currency: 'USD',
      vendor: 'Comcast',
      category: 'INTERNET',
      cadence: 'MONTHLY',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });
  });

  it('reads a streaming receipt with no billing period, taking the cadence from its words', () => {
    const { draft } = extractBillingDraft(fixture('es-netflix-receipt.txt'), SPAIN);

    expect(draft).toEqual({
      amountMinor: 1299,
      currency: 'EUR',
      vendor: 'Netflix',
      category: 'SUBSCRIPTIONS',
      cadence: 'MONTHLY',
      periodStart: null,
      periodEnd: null,
    });
  });

  it('reads a UK water bill in pounds with written months', () => {
    const { draft } = extractBillingDraft(fixture('uk-water.txt'), { countryCode: 'GB', currency: 'GBP' });

    expect(draft).toMatchObject({ amountMinor: 8432, currency: 'GBP', category: 'WATER', periodStart: '2026-04-01', periodEnd: '2026-09-30' });
  });

  it('prefers the amount to pay over subtotals, tax lines and consumption', () => {
    const text = ['Iberdrola', 'Subtotal 79,75 €', 'IVA 21% 16,75 €', 'Total energía 54,10 €', 'TOTAL A PAGAR 96,50 €'].join('\n');

    expect(extractBillingDraft(text, SPAIN).draft.amountMinor).toBe(9650);
  });

  it('takes the amount from the line after its label', () => {
    expect(extractBillingDraft('Endesa\nImporte total\n96,50 €', SPAIN).draft.amountMinor).toBe(9650);
  });

  it('answers nothing when two different totals compete', () => {
    const text = ['Iberdrola', 'Total a pagar 96,50 €', 'Total a pagar 120,00 €'].join('\n');

    expect(extractBillingDraft(text, SPAIN).draft.amountMinor).toBeNull();
  });

  it('accepts the same total printed twice', () => {
    const text = ['Iberdrola', 'Total a pagar 96,50 €', 'Importe total: 96,50 EUR'].join('\n');

    expect(extractBillingDraft(text, SPAIN).draft.amountMinor).toBe(9650);
  });

  it('answers nothing for an amount that is ambiguous or has no total label', () => {
    expect(extractBillingDraft('Iberdrola\nTotal a pagar 1.234', SPAIN).draft.amountMinor).toBeNull();
    expect(extractBillingDraft('Iberdrola\nConsumo del mes\nPotencia', SPAIN).draft.amountMinor).toBeNull();
  });

  it('never copies a number from a consumption or tax line when no total is labelled', () => {
    expect(extractBillingDraft('Iberdrola factura\nConsumo 245,50 kWh\nIVA 21,00 %', SPAIN).draft.amountMinor).toBeNull();
  });

  it('reads zero-decimal currencies without inventing cents', () => {
    const { draft } = extractBillingDraft('NTT Docomo\nTotal 4,980 JPY\n', { countryCode: 'JP', currency: 'JPY' });

    expect(draft.amountMinor).toBe(4980);
    expect(draft.currency).toBe('JPY');
  });

  it('leaves a field blank when the document contradicts the phase', () => {
    expect(extractBillingDraft(fixture('es-electricity.txt'), ARGENTINA).draft.currency).toBe('EUR');
  });
});

describe('extractBillingDraft: what it must not guess', () => {
  it('returns an empty draft for a scanned PDF with no text', () => {
    expect(extractBillingDraft('', SPAIN)).toEqual({ textFound: false, draft: EMPTY_DRAFT });
    expect(extractBillingDraft('  \n \t\n', SPAIN)).toEqual({ textFound: false, draft: EMPTY_DRAFT });
    expect(extractBillingDraft('\u0000\u0001 12 \n', SPAIN)).toEqual({ textFound: false, draft: EMPTY_DRAFT });
  });

  it('returns an empty draft, with text found, for a document that is not a bill', () => {
    const result = extractBillingDraft('Dear John,\nThank you for your letter about the garden party next week. Kind regards, Mary.', SPAIN);

    expect(result).toEqual({ textFound: true, draft: EMPTY_DRAFT });
  });

  it('survives malformed structure: huge lines, control characters, lone separators', () => {
    const noise = ['€'.repeat(5000), 'Total ,,,, ..... €', 'Periodo: // - //', '\u0000\u0007Total\u0000 96,50\u0000€', '9'.repeat(10000)].join('\n');

    expect(() => extractBillingDraft(noise, SPAIN)).not.toThrow();
    expect(extractBillingDraft(noise, SPAIN).draft.periodStart).toBeNull();
  });

  it('is deterministic: the same text always gives the same draft', () => {
    const text = fixture('es-electricity.txt');

    expect(extractBillingDraft(text, SPAIN)).toEqual(extractBillingDraft(text, SPAIN));
  });

  it('works without any hint about the phase', () => {
    const { draft } = extractBillingDraft(fixture('es-electricity.txt'), {});

    expect(draft.amountMinor).toBe(9650);
    expect(draft.periodStart).toBe('2026-07-15');
  });

  it('does not read an ambiguous date without a hint about the country', () => {
    const text = 'Endesa\nPeriodo: 03/04/2026 - 04/05/2026\nTotal a pagar 50,00 €';

    expect(extractBillingDraft(text, {}).draft).toMatchObject({ periodStart: null, periodEnd: null, amountMinor: 5000 });
    expect(extractBillingDraft(text, SPAIN).draft).toMatchObject({ periodStart: '2026-04-03', periodEnd: '2026-05-04' });
  });
});
