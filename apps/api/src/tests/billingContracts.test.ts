import {
  BILLING_CADENCES,
  FIXED_COST_CATEGORIES,
  FX_RATE_SOURCES,
  ROLLING_WINDOW_MONTHS,
  createBillingRecordRequest,
  listBillingRecordsResponse,
  phaseComparisonResponse,
  trendsResponse,
  updateBillingRecordRequest,
} from '../contracts';

const bill = {
  phaseId: 'phase-1',
  category: 'ELECTRICITY',
  cadence: 'BIMONTHLY',
  periodStart: '2026-07-15',
  periodEnd: '2026-09-14',
  amountMinor: 9600,
  vendor: 'Iberdrola',
};

describe('billing vocabulary', () => {
  it('has the recurring cadences plus one-off, and the three rolling windows', () => {
    expect(BILLING_CADENCES).toEqual(['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUAL', 'ONE_OFF']);
    expect(ROLLING_WINDOW_MONTHS).toEqual([3, 6, 12]);
    expect(FX_RATE_SOURCES).toEqual(['ECB', 'BCRA_OFFICIAL', 'REFERENCE']);
  });
});

describe('createBillingRecordRequest', () => {
  it('accepts a bill for a billing period, with optional notes', () => {
    expect(createBillingRecordRequest.safeParse(bill).success).toBe(true);
    expect(createBillingRecordRequest.safeParse({ ...bill, notes: 'Final reading' }).success).toBe(true);
  });

  it.each(BILLING_CADENCES)('accepts the cadence %s', (cadence) => {
    expect(createBillingRecordRequest.safeParse({ ...bill, cadence, periodStart: '2026-09-01', periodEnd: '2026-09-30' }).success).toBe(true);
  });

  it.each([
    ['MONTHLY', '2026-10-05', true],
    ['MONTHLY', '2026-10-06', false],
    ['BIMONTHLY', '2026-11-05', true],
    ['BIMONTHLY', '2026-11-06', false],
    ['QUARTERLY', '2026-12-09', true],
    ['QUARTERLY', '2026-12-10', false],
    ['ONE_OFF', '2027-12-31', true],
  ])('a %s bill starting 2026-09-01 and ending %s is accepted: %s', (cadence, periodEnd, accepted) => {
    const result = createBillingRecordRequest.safeParse({ ...bill, cadence, periodStart: '2026-09-01', periodEnd });
    expect(result.success).toBe(accepted);
    if (!accepted) expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['periodEnd']);
  });

  it('accepts a one-day period but not one that ends before it starts', () => {
    expect(createBillingRecordRequest.safeParse({ ...bill, periodEnd: bill.periodStart }).success).toBe(true);

    const result = createBillingRecordRequest.safeParse({ ...bill, periodEnd: '2026-07-14' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['periodEnd']);
  });

  it.each([
    ['no phase', { phaseId: undefined }],
    ['an unknown category', { category: 'COFFEE' }],
    ['a blank vendor', { vendor: '  ' }],
    ['a negative amount', { amountMinor: -1 }],
    ['a fractional amount', { amountMinor: 10.5 }],
    ['an impossible date', { periodStart: '2026-02-30' }],
    ['an unknown field such as the owner', { userId: 'someone-else' }],
  ])('rejects %s', (_label, change) => {
    expect(createBillingRecordRequest.safeParse({ ...bill, ...change }).success).toBe(false);
  });
});

describe('updateBillingRecordRequest', () => {
  it('needs something to change, and cannot move a bill to another phase', () => {
    expect(updateBillingRecordRequest.safeParse({}).success).toBe(false);
    expect(updateBillingRecordRequest.safeParse({ amountMinor: 10000, notes: null }).success).toBe(true);
    expect(updateBillingRecordRequest.safeParse({ phaseId: 'other' }).success).toBe(false);
  });
});

describe('response shapes', () => {
  it('lists bills with the currency of their phase', () => {
    expect(
      listBillingRecordsResponse.safeParse({
        records: [{ ...bill, id: 'r1', currency: 'EUR', notes: null }],
      }).success
    ).toBe(true);
  });

  it('describes trends per currency, with the three windows and how many months they really cover', () => {
    const windows = ROLLING_WINDOW_MONTHS.map((windowMonths) => ({
      windowMonths,
      totalMinor: 30000,
      coveredMonths: 2,
      averageMinor: 15000,
    }));
    const byCategory = Object.fromEntries(FIXED_COST_CATEGORIES.map((category) => [category, 0]));

    const parsed = trendsResponse.safeParse({
      asOf: '2026-10-31',
      lastCompleteMonth: '2026-09',
      fixedCosts: [{ currency: 'EUR', windows }],
      subscriptions: [{ currency: 'EUR', windows: windows.map((w) => ({ ...w, averageMinor: null, coveredMonths: 0, totalMinor: 0 })) }],
      phases: [
        {
          phaseId: 'p1',
          name: 'Madrid',
          currency: 'EUR',
          coveredMonths: 5,
          observedMonthlyMinor: 130000,
          declaredMonthlyMinor: 129300,
          driftMinor: 700,
          byCategoryMinor: byCategory,
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('says where a converted exchange rate came from', () => {
    const comparison = {
      comparable: true,
      fromPhaseId: 'a',
      toPhaseId: 'b',
      currency: 'ARS',
      monthlyIncomeDeltaMinor: 0,
      monthlyFixedCostsDeltaMinor: 0,
      savingsCapacityDeltaMinor: 0,
      fixedCostsDeltaFraction: null,
      categories: [],
      rateSources: [{ currency: 'ARS', source: 'BCRA_OFFICIAL' }],
    };

    expect(phaseComparisonResponse.safeParse(comparison).success).toBe(true);
    expect(
      phaseComparisonResponse.safeParse({ ...comparison, rateSources: [{ currency: 'ARS', source: 'GUESS' }] }).success
    ).toBe(false);
  });
});
