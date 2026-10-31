import { billIdentity } from '../domain/billIdentity';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';

const bill = {
  phaseId: 'phase-1',
  category: 'ELECTRICITY' as const,
  periodStart: '2026-07-15',
  periodEnd: '2026-09-14',
  amountMinor: 9650,
  vendor: 'Iberdrola Clientes',
};

describe('billIdentity: what makes two bills the same bill', () => {
  it('ignores case, accents and spacing in the vendor', () => {
    expect(billIdentity({ ...bill, vendor: '  IBERDROLA   clientes ' })).toBe(billIdentity(bill));
    expect(billIdentity({ ...bill, vendor: 'Telefónica' })).toBe(billIdentity({ ...bill, vendor: 'telefonica' }));
  });

  it.each([
    ['phase', { phaseId: 'phase-2' }],
    ['category', { category: 'GAS' as const }],
    ['period start', { periodStart: '2026-07-16' }],
    ['period end', { periodEnd: '2026-09-15' }],
    ['amount', { amountMinor: 9651 }],
    ['vendor', { vendor: 'Endesa' }],
  ])('differs when the %s differs', (_name, change) => {
    expect(billIdentity({ ...bill, ...change })).not.toBe(billIdentity(bill));
  });

  it('cannot be confused by values that run into each other', () => {
    expect(billIdentity({ ...bill, phaseId: 'a', vendor: 'bc' })).not.toBe(billIdentity({ ...bill, phaseId: 'ab', vendor: 'c' }));
  });
});

describe('HmacBillFingerprinter', () => {
  const key = Buffer.alloc(32, 7);

  it('is deterministic and hides the bill', () => {
    const fingerprinter = new HmacBillFingerprinter(key);
    const identity = billIdentity(bill);

    const fingerprint = fingerprinter.fingerprint('user-1', identity);

    expect(fingerprinter.fingerprint('user-1', identity)).toBe(fingerprint);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    for (const secret of ['iberdrola', '9650', '2026']) expect(fingerprint).not.toContain(secret);
  });

  it('differs per person, per bill and per key, so it cannot be matched across accounts or guessed without the key', () => {
    const identity = billIdentity(bill);
    const base = new HmacBillFingerprinter(key).fingerprint('user-1', identity);

    expect(new HmacBillFingerprinter(key).fingerprint('user-2', identity)).not.toBe(base);
    expect(new HmacBillFingerprinter(key).fingerprint('user-1', billIdentity({ ...bill, amountMinor: 1 }))).not.toBe(base);
    expect(new HmacBillFingerprinter(Buffer.alloc(32, 8)).fingerprint('user-1', identity)).not.toBe(base);
  });

  it('is not the key used to encrypt the data', () => {
    const plain = require('crypto').createHmac('sha256', key).update('user-1\0' + billIdentity(bill)).digest('hex');

    expect(new HmacBillFingerprinter(key).fingerprint('user-1', billIdentity(bill))).not.toBe(plain);
  });

  it('refuses a key of the wrong size', () => {
    expect(() => new HmacBillFingerprinter(Buffer.alloc(16))).toThrow();
  });
});
