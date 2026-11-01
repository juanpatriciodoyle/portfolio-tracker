import { FIXED_COST_CATEGORIES, type FixedCostCategory } from '../contracts';
import { AVERAGE_DAYS_PER_MONTH } from '../domain/calendarDate';
import { effectiveMonthlyCosts, type BilledCost, type DeclaredCost } from '../domain/effectiveCosts';
import { buildTimeline, createLivingPhase, phaseSnapshot, type LivingPhase } from '../domain/livingPhase';

const AS_OF = '2026-10-15';

const declared = (
  category: FixedCostCategory,
  amountMinor: number,
  extra: Partial<DeclaredCost> = {}
): DeclaredCost => ({ category, amountMinor, cadence: 'MONTHLY', label: null, endDate: null, ...extra });

const bill = (category: FixedCostCategory, amountMinor: number, periodStart: string, periodEnd: string, extra: Partial<BilledCost> = {}): BilledCost => ({
  category,
  amountMinor,
  periodStart,
  periodEnd,
  cadence: 'MONTHLY',
  vendor: 'Vendor',
  ...extra,
});

const monthlyOf = (result: ReturnType<typeof effectiveMonthlyCosts>, category: FixedCostCategory) => result.byCategory[category].monthlyMinor;

describe('a cost that was ended', () => {
  it('still counts on its last day and drops out the day after', () => {
    const netflix = declared('SUBSCRIPTIONS', 1299, { label: 'Netflix', endDate: '2026-10-15' });
    expect(monthlyOf(effectiveMonthlyCosts({ declared: [netflix], bills: [], asOf: '2026-10-15' }), 'SUBSCRIPTIONS')).toBe(1299);
    expect(monthlyOf(effectiveMonthlyCosts({ declared: [netflix], bills: [], asOf: '2026-10-16' }), 'SUBSCRIPTIONS')).toBe(0);
  });

  it('keeps counting a cost whose end date is still ahead', () => {
    const result = effectiveMonthlyCosts({ declared: [declared('INTERNET', 3000, { endDate: '2027-01-31' })], bills: [], asOf: AS_OF });
    expect(result.byCategory.INTERNET).toEqual({ monthlyMinor: 3000, basis: 'DECLARED', billCount: 0 });
  });

  it('leaves the other costs of the category alone', () => {
    const result = effectiveMonthlyCosts({
      declared: [declared('SUBSCRIPTIONS', 1299, { label: 'Netflix', endDate: '2026-01-31' }), declared('SUBSCRIPTIONS', 999, { label: 'Spotify' })],
      bills: [],
      asOf: AS_OF,
    });
    expect(monthlyOf(result, 'SUBSCRIPTIONS')).toBe(999);
    expect(result.monthlyFixedCostsMinor).toBe(999);
  });

  it('reads as no basis once nothing active is left in its category', () => {
    const result = effectiveMonthlyCosts({ declared: [declared('PHONE', 2000, { endDate: '2026-01-31' })], bills: [], asOf: AS_OF });
    expect(result.byCategory.PHONE).toEqual({ monthlyMinor: 0, basis: null, billCount: 0 });
  });

  it('also silences the bills of the sender it was declared for', () => {
    const result = effectiveMonthlyCosts({
      declared: [declared('SUBSCRIPTIONS', 1299, { label: 'Netflix', endDate: '2026-08-31' })],
      bills: [
        bill('SUBSCRIPTIONS', 1299, '2026-07-01', '2026-07-31', { vendor: 'Netflix' }),
        bill('SUBSCRIPTIONS', 1299, '2026-08-01', '2026-08-31', { vendor: 'Netflix' }),
        bill('SUBSCRIPTIONS', 999, '2026-09-01', '2026-09-30', { vendor: 'Spotify' }),
      ],
      asOf: AS_OF,
    });
    expect(result.byCategory.SUBSCRIPTIONS).toEqual({ monthlyMinor: 999, basis: 'BILLS', billCount: 1 });
  });

  it('keeps the bills of a sender while its end date is not past', () => {
    const result = effectiveMonthlyCosts({
      declared: [declared('SUBSCRIPTIONS', 1299, { label: 'Netflix', endDate: '2026-12-31' })],
      bills: [bill('SUBSCRIPTIONS', 1299, '2026-09-01', '2026-09-30', { vendor: 'Netflix' })],
      asOf: AS_OF,
    });
    expect(monthlyOf(result, 'SUBSCRIPTIONS')).toBe(1299);
  });
});

describe('a variable utility projects forward from the bills received', () => {
  it.each([
    ['one bill', [bill('ELECTRICITY', 6000, '2026-08-01', '2026-08-31')], 6000],
    ['two bills', [bill('ELECTRICITY', 6000, '2026-08-01', '2026-08-31'), bill('ELECTRICITY', 8000, '2026-09-01', '2026-09-30')], 7000],
  ])('with %s the average stands as this month and every month after', (_name, bills, expected) => {
    for (const asOf of ['2026-10-15', '2027-03-15', '2028-01-01']) {
      expect(monthlyOf(effectiveMonthlyCosts({ declared: [], bills, asOf }), 'ELECTRICITY')).toBe(expected);
    }
  });

  it('moves to the new average as soon as another bill arrives', () => {
    const bills = [bill('GAS', 4000, '2026-08-01', '2026-08-31'), bill('GAS', 5000, '2026-09-01', '2026-09-30'), bill('GAS', 9000, '2026-10-01', '2026-10-31')];
    expect(monthlyOf(effectiveMonthlyCosts({ declared: [], bills: bills.slice(0, 2), asOf: AS_OF }), 'GAS')).toBe(4500);
    expect(monthlyOf(effectiveMonthlyCosts({ declared: [], bills, asOf: AS_OF }), 'GAS')).toBe(6000);
  });
});

const phase = (overrides: Partial<LivingPhase> = {}): LivingPhase =>
  createLivingPhase({ id: 'p1', startDate: '2026-01-01', endDate: null, currency: 'EUR', incomeStreams: [], fixedCosts: [], bills: [], ...overrides });

const fixed = (id: string, endDate: string | null, amountMinor = 3000) => ({ id, category: 'SUBSCRIPTIONS' as const, cadence: 'MONTHLY' as const, amountMinor, label: id, endDate });

describe('an ended cost in a living phase', () => {
  it('leaves the monthly burn of today and keeps what it cost while it ran', () => {
    const lived = phase({ fixedCosts: [fixed('gym', '2026-03-31', 3000), fixed('rent-ish', null, 10000)] });
    expect(phaseSnapshot(lived, '2026-06-30').monthlyFixedCostsMinor).toBe(10000);

    const [entry] = buildTimeline([lived], '2026-06-30');
    // The gym ran 1 Jan to 31 Mar: 90 days. Rent ran the whole stay.
    expect(entry.monthlyFixedCostsMinor).toBe(10000);
    expect(entry.totalFixedCostsMinor).toBe(Math.round(10000 * entry.months + (3000 * 90) / AVERAGE_DAYS_PER_MONTH));
  });

  it('counts nothing for a cost that ended before the phase began', () => {
    const lived = phase({ fixedCosts: [fixed('old', '2025-12-31', 3000)] });
    const [entry] = buildTimeline([lived], '2026-06-30');
    expect(entry.totalFixedCostsMinor).toBe(0);
  });

  it('adds up in the categories as before when nothing ended', () => {
    const [entry] = buildTimeline([phase({ fixedCosts: [fixed('a', null, 1000)] })], '2026-06-30');
    expect(entry.totalFixedCostsMinor).toBe(Math.round(1000 * entry.months));
    expect(FIXED_COST_CATEGORIES).toContain('SUBSCRIPTIONS');
  });
});
