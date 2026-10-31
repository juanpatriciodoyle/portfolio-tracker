import { describe, expect, it } from 'vitest';
import type { BillingDraft } from '../../../contracts';
import { blankFields, reviewFormFrom, validateReview } from '../documentForm';

const empty: BillingDraft = { amountMinor: null, currency: null, vendor: null, category: null, cadence: null, periodStart: null, periodEnd: null };
const full: BillingDraft = {
  amountMinor: 9650,
  currency: 'EUR',
  vendor: 'Iberdrola',
  category: 'ELECTRICITY',
  cadence: 'BIMONTHLY',
  periodStart: '2026-07-15',
  periodEnd: '2026-09-14',
};

describe('reviewFormFrom', () => {
  it('prefills exactly what the draft holds', () => {
    expect(reviewFormFrom(full, 'EUR')).toEqual({
      category: 'ELECTRICITY',
      cadence: 'BIMONTHLY',
      vendor: 'Iberdrola',
      amount: '96.50',
      periodStart: '2026-07-15',
      periodEnd: '2026-09-14',
    });
  });

  it('leaves everything blank for an empty draft, including the cadence', () => {
    expect(reviewFormFrom(empty, 'EUR')).toEqual({ category: null, cadence: null, vendor: '', amount: '', periodStart: '', periodEnd: '' });
  });

  it('formats the amount with the exponent of the phase currency', () => {
    expect(reviewFormFrom({ ...full, amountMinor: 450000 }, 'JPY').amount).toBe('450000');
  });
});

describe('blankFields', () => {
  it('lists nothing for a complete draft', () => {
    expect(blankFields(full)).toEqual([]);
  });

  it('lists every field the document did not say', () => {
    expect(blankFields(empty)).toEqual(['category', 'vendor', 'amount', 'periodStart', 'periodEnd', 'cadence']);
  });

  it('lists only the missing ones', () => {
    expect(blankFields({ ...full, vendor: null, periodEnd: null })).toEqual(['vendor', 'periodEnd']);
  });
});

describe('validateReview', () => {
  it('blocks saving while the cadence is still blank', () => {
    const result = validateReview({ ...reviewFormFrom(full, 'EUR'), cadence: null }, 'p1', 'EUR');

    expect(result).toEqual({ ok: false, errors: { cadence: expect.any(String) } });
  });

  it('blocks saving an empty draft with an error on every field', () => {
    const result = validateReview(reviewFormFrom(empty, 'EUR'), 'p1', 'EUR');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['amount', 'cadence', 'category', 'periodEnd', 'periodStart', 'vendor']);
  });

  it('produces the request for a complete form', () => {
    const result = validateReview(reviewFormFrom(full, 'EUR'), 'p1', 'EUR');

    expect(result).toEqual({
      ok: true,
      create: {
        phaseId: 'p1',
        category: 'ELECTRICITY',
        cadence: 'BIMONTHLY',
        periodStart: '2026-07-15',
        periodEnd: '2026-09-14',
        amountMinor: 9650,
        vendor: 'Iberdrola',
      },
    });
  });
});
