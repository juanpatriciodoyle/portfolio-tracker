import { daysInclusive, monthOf } from '../domain/calendarDate';
import { allocateToMonths, createBillingRecord, type BillingRecord } from '../domain/billing';
import { InvalidBillingRecordError } from '../domain/errors';

const bill = (periodStart: string, periodEnd: string, amountMinor: number, overrides: Partial<BillingRecord> = {}): BillingRecord => ({
  id: 'r1',
  phaseId: 'p1',
  category: 'ELECTRICITY',
  cadence: 'BIMONTHLY',
  periodStart,
  periodEnd,
  amountMinor,
  ...overrides,
});

describe('createBillingRecord', () => {
  const valid = bill('2026-07-15', '2026-09-14', 9600);

  it('accepts a normal bill, a one-day bill and a zero amount', () => {
    expect(createBillingRecord(valid)).toEqual(valid);
    expect(() => createBillingRecord(bill('2026-07-15', '2026-07-15', 0))).not.toThrow();
  });

  it.each([
    ['a negative amount', bill('2026-07-01', '2026-07-31', -1)],
    ['a fractional amount', bill('2026-07-01', '2026-07-31', 10.5)],
    ['a period that ends before it starts', bill('2026-07-31', '2026-07-01', 100)],
    ['a period longer than two years', bill('2024-01-01', '2026-06-01', 100)],
  ])('rejects %s', (_label, record) => {
    expect(() => createBillingRecord(record)).toThrow(InvalidBillingRecordError);
  });
});

describe('allocateToMonths', () => {
  it('puts a bill inside one month entirely in that month', () => {
    expect(allocateToMonths(bill('2026-01-01', '2026-01-31', 12000, { cadence: 'MONTHLY' }))).toEqual({ '2026-01': 12000 });
    expect(allocateToMonths(bill('2026-04-10', '2026-04-10', 5, { cadence: 'ONE_OFF' }))).toEqual({ '2026-04': 5 });
  });

  it('spreads a bimonthly bill across the months it covers, by days', () => {
    // 17 days in January, 28 in February, 14 in March: 59 days, 100 per day
    expect(allocateToMonths(bill('2026-01-15', '2026-03-14', 5900))).toEqual({
      '2026-01': 1700,
      '2026-02': 2800,
      '2026-03': 1400,
    });
  });

  it('hands out leftover units by largest remainder, earlier months first on ties, so nothing is lost', () => {
    // 31 + 28 + 31 days; 100 does not split evenly: 34.4, 31.1, 34.4
    expect(allocateToMonths(bill('2026-01-01', '2026-03-31', 100))).toEqual({ '2026-01': 35, '2026-02': 31, '2026-03': 34 });
    // one day each side of a month end: 500.5 and 500.5
    expect(allocateToMonths(bill('2024-01-31', '2024-02-01', 1001))).toEqual({ '2024-01': 501, '2024-02': 500 });
  });

  it('counts leap days and crosses year ends', () => {
    expect(allocateToMonths(bill('2024-02-01', '2024-02-29', 2900, { cadence: 'MONTHLY' }))).toEqual({ '2024-02': 2900 });
    expect(allocateToMonths(bill('2025-12-20', '2026-01-10', 2200))).toEqual({ '2025-12': 1200, '2026-01': 1000 });
  });

  it('spreads an annual bill over twelve months at one rate per day', () => {
    const months = allocateToMonths(bill('2026-01-01', '2026-12-31', 36500, { cadence: 'ANNUAL', category: 'TAXES' }));

    expect(Object.keys(months)).toHaveLength(12);
    expect(months['2026-01']).toBe(3100); // 31 days x 100
    expect(months['2026-02']).toBe(2800); // 28 days x 100
  });

  it('still marks the months of a zero bill as covered', () => {
    expect(allocateToMonths(bill('2026-01-15', '2026-02-14', 0))).toEqual({ '2026-01': 0, '2026-02': 0 });
  });

  it('always adds up to the bill and covers exactly the months of the period', () => {
    let seed = 20261101;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };

    for (let run = 0; run < 500; run++) {
      const start = new Date(Date.UTC(2025, 0, 1) + Math.floor(random() * 700) * 86_400_000);
      const end = new Date(start.getTime() + Math.floor(random() * 400) * 86_400_000);
      const iso = (date: Date) => date.toISOString().slice(0, 10);
      const record = bill(iso(start), iso(end), Math.floor(random() * 2_000_000));

      const months = allocateToMonths(record);

      expect(Object.values(months).reduce((sum, value) => sum + value, 0)).toBe(record.amountMinor);
      expect(Object.keys(months)[0]).toBe(monthOf(record.periodStart));
      expect(Object.keys(months).at(-1)).toBe(monthOf(record.periodEnd));
      expect(daysInclusive(record.periodStart, record.periodEnd)).toBeGreaterThan(0);
    }
  });

  it('never reads host-local calendar fields, so the time zone cannot matter', () => {
    const record = bill('2025-12-20', '2026-01-10', 2200);
    const expected = allocateToMonths(record);
    (['getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours'] as const).forEach((method) => {
      jest.spyOn(Date.prototype, method).mockImplementation(() => {
        throw new Error(`${method} depends on the host time zone`);
      });
    });

    expect(allocateToMonths(record)).toEqual(expected);
  });
});
