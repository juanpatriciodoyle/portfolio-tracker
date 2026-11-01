import { salary } from './support/income';
import { createLivingPhase, type LivingPhase } from '../domain/livingPhase';
import type { BillingRecord } from '../domain/billing';
import { buildTrends, lastCompleteMonth, monthlyTotals, rollingAverage } from '../domain/trends';

const bill = (id: string, periodStart: string, periodEnd: string, amountMinor: number, overrides: Partial<BillingRecord> = {}): BillingRecord => ({
  id,
  phaseId: 'madrid',
  category: 'RENT',
  cadence: 'MONTHLY',
  periodStart,
  periodEnd,
  amountMinor,
  ...overrides,
});

const madrid: LivingPhase = createLivingPhase({
  id: 'madrid',
  startDate: '2022-09-01',
  endDate: null,
  currency: 'EUR',
  incomeStreams: salary(320000),
  fixedCosts: [
    { id: 'c1', category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000 },
    { id: 'c2', category: 'ELECTRICITY', cadence: 'BIMONTHLY', amountMinor: 9600 },
  ],
});

describe('lastCompleteMonth', () => {
  it.each([
    ['2026-10-31', '2026-09'],
    ['2026-03-01', '2026-02'],
    ['2026-01-05', '2025-12'],
  ])('on %s the newest month that is over is %s', (asOf, expected) => {
    expect(lastCompleteMonth(asOf)).toBe(expected);
  });
});

describe('monthlyTotals', () => {
  it('adds the bills of each month, spreading multi-month bills and ignoring one-offs', () => {
    const totals = monthlyTotals([
      bill('r1', '2026-07-01', '2026-07-31', 120000),
      bill('r2', '2026-07-01', '2026-07-31', 1299, { category: 'SUBSCRIPTIONS' }),
      bill('r3', '2026-07-10', '2026-07-10', 99900, { cadence: 'ONE_OFF', category: 'OTHER' }),
    ]);

    expect(totals).toEqual({ '2026-07': 121299 });
  });
});

describe('rollingAverage', () => {
  const totals = { '2026-07': 100, '2026-08': 200, '2026-09': 300 };

  it('averages the months of the window that have bills, and says how many that is', () => {
    expect(rollingAverage(totals, '2026-09', 3)).toEqual({ windowMonths: 3, totalMinor: 600, coveredMonths: 3, averageMinor: 200 });
    expect(rollingAverage(totals, '2026-09', 6)).toEqual({ windowMonths: 6, totalMinor: 600, coveredMonths: 3, averageMinor: 200 });
    expect(rollingAverage(totals, '2026-09', 12)).toMatchObject({ coveredMonths: 3, averageMinor: 200 });
  });

  it('only looks at months inside the window', () => {
    expect(rollingAverage({ ...totals, '2026-05': 9000 }, '2026-09', 3)).toMatchObject({ totalMinor: 600, coveredMonths: 3 });
    expect(rollingAverage({ ...totals, '2026-05': 9000 }, '2026-09', 6)).toMatchObject({ totalMinor: 9600, coveredMonths: 4 });
  });

  it('does not pretend a gap is a zero month', () => {
    expect(rollingAverage({ '2026-07': 100, '2026-09': 300 }, '2026-09', 3)).toEqual({
      windowMonths: 3,
      totalMinor: 400,
      coveredMonths: 2,
      averageMinor: 200,
    });
  });

  it('has no average when there are no bills, and counts a zero bill as a covered month', () => {
    expect(rollingAverage({}, '2026-09', 3)).toEqual({ windowMonths: 3, totalMinor: 0, coveredMonths: 0, averageMinor: null });
    expect(rollingAverage({ '2026-09': 0 }, '2026-09', 3)).toMatchObject({ coveredMonths: 1, averageMinor: 0 });
  });

  it('rounds half away from zero', () => {
    expect(rollingAverage({ '2026-08': 100, '2026-09': 201 }, '2026-09', 3).averageMinor).toBe(151);
  });
});

describe('buildTrends', () => {
  const records: BillingRecord[] = [
    bill('r1', '2026-07-01', '2026-07-31', 120000),
    bill('r2', '2026-08-01', '2026-08-31', 120000),
    bill('r3', '2026-09-01', '2026-09-30', 120000),
    // 62 days, 17 + 31 + 14: shared out as 2632 + 4800 + 2168
    bill('r4', '2026-07-15', '2026-09-14', 9600, { category: 'ELECTRICITY', cadence: 'BIMONTHLY' }),
    bill('r5', '2026-08-01', '2026-08-31', 1299, { category: 'SUBSCRIPTIONS' }),
    bill('r6', '2026-09-01', '2026-09-30', 1299, { category: 'SUBSCRIPTIONS' }),
    bill('r7', '2026-10-01', '2026-10-31', 120000), // October is not over yet on 31 October
    bill('r8', '2026-09-05', '2026-09-05', 50000, { category: 'OTHER', cadence: 'ONE_OFF' }),
  ];

  it('is empty without bills', () => {
    expect(buildTrends({ records: [], phases: [madrid], asOf: '2026-10-31' })).toEqual({
      lastCompleteMonth: '2026-09',
      fixedCosts: [],
      subscriptions: [],
      phases: [],
    });
  });

  it('averages fixed costs and subscriptions separately over complete months only', () => {
    const trends = buildTrends({ records, phases: [madrid], asOf: '2026-10-31' });

    expect(trends.lastCompleteMonth).toBe('2026-09');
    // 122,632 + 124,800 + 122,168 = 369,600 over July, August, September
    expect(trends.fixedCosts).toEqual([
      {
        currency: 'EUR',
        windows: [
          { windowMonths: 3, totalMinor: 369600, coveredMonths: 3, averageMinor: 123200 },
          { windowMonths: 6, totalMinor: 369600, coveredMonths: 3, averageMinor: 123200 },
          { windowMonths: 12, totalMinor: 369600, coveredMonths: 3, averageMinor: 123200 },
        ],
      },
    ]);
    expect(trends.subscriptions[0].windows[0]).toEqual({ windowMonths: 3, totalMinor: 2598, coveredMonths: 2, averageMinor: 1299 });
  });

  it('compares what the bills say with what was declared, per phase', () => {
    const [observed] = buildTrends({ records, phases: [madrid], asOf: '2026-10-31' }).phases;

    expect(observed).toMatchObject({
      phaseId: 'madrid',
      currency: 'EUR',
      coveredMonths: 3,
      declaredMonthlyMinor: 124800,
      observedMonthlyMinor: 124066, // (369,600 + 2,598) / 3
      driftMinor: 124066 - 124800,
    });
    expect(observed.byCategoryMinor).toMatchObject({ RENT: 120000, ELECTRICITY: 3200, SUBSCRIPTIONS: 866, OTHER: 0 });
  });

  it('keeps currencies apart, in a stable order', () => {
    const buenosAires = createLivingPhase({
      id: 'ba',
      startDate: '2026-06-01',
      endDate: null,
      currency: 'ARS',
      incomeStreams: salary(90000000),
      fixedCosts: [],
    });
    const arsBill = bill('r9', '2026-09-01', '2026-09-30', 40000000, { phaseId: 'ba' });

    const trends = buildTrends({ records: [...records, arsBill], phases: [madrid, buenosAires], asOf: '2026-10-31' });

    expect(trends.fixedCosts.map((group) => group.currency)).toEqual(['ARS', 'EUR']);
    expect(trends.fixedCosts[0].windows[0]).toMatchObject({ totalMinor: 40000000, coveredMonths: 1 });
    expect(trends.phases.map((phase) => phase.phaseId).sort()).toEqual(['ba', 'madrid']);
  });

  it('does not depend on the clock or the input order', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('1999-01-01T00:00:00Z'));
    const first = buildTrends({ records, phases: [madrid], asOf: '2026-10-31' });
    jest.setSystemTime(new Date('2040-01-01T00:00:00Z'));

    expect(buildTrends({ records: [...records].reverse(), phases: [madrid], asOf: '2026-10-31' })).toEqual(first);
    jest.useRealTimers();
  });
});
