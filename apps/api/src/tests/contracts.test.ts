import { salary } from './support/income';
import {
  COST_CADENCES,
  ENCRYPTION_NOT_CONFIGURED,
  FIXED_COST_CATEGORIES,
  MAX_AMOUNT_MINOR,
  amountMinorSchema,
  apiErrorResponse,
  backfillLivingPhasesRequest,
  calendarDateSchema,
  countryCodeSchema,
  createFixedCostRequest,
  createLivingPhaseRequest,
  currencyCodeSchema,
  phaseComparisonResponse,
  phaseOverlapErrorResponse,
  saveProfileRequest,
  timelineResponse,
  updateFixedCostRequest,
  updateLivingPhaseRequest,
  validationErrorResponse,
} from '../contracts';

const validPhase = {
  name: 'Madrid',
  city: 'Madrid',
  countryCode: 'ES',
  tenure: 'RENT',
  startDate: '2022-09-01',
  currency: 'EUR',
  incomeStreams: salary(320000),
};

const validCost = { category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000 };

const issuePaths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('.')) ?? [];

describe('primitives', () => {
  it.each(['2024-02-29', '2000-01-01', '2200-12-31'])('accepts the real calendar date %s', (value) => {
    expect(calendarDateSchema.safeParse(value).success).toBe(true);
  });

  it.each(['2023-02-29', '2024-13-01', '2024-04-31', '2024-1-1', '1899-12-31', '2201-01-01', '', 'tomorrow'])(
    'rejects %p as a calendar date',
    (value) => {
      expect(calendarDateSchema.safeParse(value).success).toBe(false);
    }
  );

  it.each(['EUR', 'ARS', 'JPY'])('accepts currency %s', (value) => {
    expect(currencyCodeSchema.safeParse(value).success).toBe(true);
  });

  it.each(['eur', 'EURO', 'E1R', ''])('rejects currency %p', (value) => {
    expect(currencyCodeSchema.safeParse(value).success).toBe(false);
  });

  it.each(['ES', 'AR'])('accepts country %s', (value) => {
    expect(countryCodeSchema.safeParse(value).success).toBe(true);
  });

  it.each(['es', 'ESP', 'E', ''])('rejects country %p', (value) => {
    expect(countryCodeSchema.safeParse(value).success).toBe(false);
  });

  it.each([0, 1, 123456, MAX_AMOUNT_MINOR])('accepts the amount %d', (value) => {
    expect(amountMinorSchema.safeParse(value).success).toBe(true);
  });

  it.each([-1, 1.5, MAX_AMOUNT_MINOR + 1, Number.NaN, Number.POSITIVE_INFINITY, '10'])(
    'rejects the amount %p',
    (value) => {
      expect(amountMinorSchema.safeParse(value).success).toBe(false);
    }
  );
});

describe('fixed cost requests', () => {
  it('accepts every category with every cadence, including quarterly', () => {
    expect(COST_CADENCES).toContain('QUARTERLY');
    expect(FIXED_COST_CATEGORIES).toContain('WATER');
    for (const category of FIXED_COST_CATEGORIES) {
      for (const cadence of COST_CADENCES) {
        expect(createFixedCostRequest.safeParse({ ...validCost, category, cadence }).success).toBe(true);
      }
    }
  });

  it('rejects unknown fields, unknown categories and unknown cadences', () => {
    expect(createFixedCostRequest.safeParse({ ...validCost, surprise: 1 }).success).toBe(false);
    expect(createFixedCostRequest.safeParse({ ...validCost, category: 'COFFEE' }).success).toBe(false);
    expect(createFixedCostRequest.safeParse({ ...validCost, cadence: 'WEEKLY' }).success).toBe(false);
  });

  it('allows a null label and rejects a blank one', () => {
    expect(createFixedCostRequest.safeParse({ ...validCost, label: null }).success).toBe(true);
    expect(createFixedCostRequest.safeParse({ ...validCost, label: '   ' }).success).toBe(false);
  });

  it('requires at least one field for an update', () => {
    expect(updateFixedCostRequest.safeParse({}).success).toBe(false);
    expect(updateFixedCostRequest.safeParse({ amountMinor: 5000 }).success).toBe(true);
    expect(updateFixedCostRequest.safeParse({ amountMinor: 5000, surprise: true }).success).toBe(false);
  });
});

describe('living phase requests', () => {
  it('defaults a missing end date to null (the current phase) and missing costs to none', () => {
    const parsed = createLivingPhaseRequest.parse(validPhase);

    expect(parsed.endDate).toBeNull();
    expect(parsed.fixedCosts).toEqual([]);
  });

  it('accepts an end date on the same day as the start but not before it', () => {
    expect(createLivingPhaseRequest.safeParse({ ...validPhase, endDate: '2022-09-01' }).success).toBe(true);

    const result = createLivingPhaseRequest.safeParse({ ...validPhase, endDate: '2022-08-31' });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(['endDate']);
  });

  it('accepts costs inline, up to fifty', () => {
    expect(createLivingPhaseRequest.safeParse({ ...validPhase, fixedCosts: [validCost] }).success).toBe(true);
    expect(
      createLivingPhaseRequest.safeParse({ ...validPhase, fixedCosts: Array(51).fill(validCost) }).success
    ).toBe(false);
  });

  it('rejects unknown fields, long names and lower-case country codes', () => {
    expect(createLivingPhaseRequest.safeParse({ ...validPhase, userId: 'someone-else' }).success).toBe(false);
    expect(createLivingPhaseRequest.safeParse({ ...validPhase, name: 'x'.repeat(81) }).success).toBe(false);
    expect(createLivingPhaseRequest.safeParse({ ...validPhase, countryCode: 'es' }).success).toBe(false);
  });

  it('requires something to change in an update, and lets a phase become current again', () => {
    expect(updateLivingPhaseRequest.safeParse({}).success).toBe(false);
    expect(updateLivingPhaseRequest.safeParse({ endDate: null }).success).toBe(true);
    expect(updateLivingPhaseRequest.safeParse({ fixedCosts: [] }).success).toBe(false);
  });

  it('needs between one and fifty phases to backfill', () => {
    expect(backfillLivingPhasesRequest.safeParse({ phases: [] }).success).toBe(false);
    expect(backfillLivingPhasesRequest.safeParse({ phases: [validPhase] }).success).toBe(true);
    expect(backfillLivingPhasesRequest.safeParse({ phases: Array(51).fill(validPhase) }).success).toBe(false);
  });
});

describe('profile request', () => {
  const profile = {
    fullName: 'Juan Doyle',
    birthYear: 1990,
    nationalities: ['AR', 'ES'],
    taxResidence: 'ES',
    householdAdults: 1,
    dependentChildren: 0,
    employmentStatus: 'EMPLOYEE',
  };

  it('accepts a full profile and a profile with every optional field empty', () => {
    expect(saveProfileRequest.safeParse(profile).success).toBe(true);
    expect(
      saveProfileRequest.safeParse({
        fullName: null,
        birthYear: null,
        nationalities: [],
        taxResidence: null,
        householdAdults: 1,
        dependentChildren: 0,
        employmentStatus: null,
      }).success
    ).toBe(true);
  });

  it.each([
    ['a duplicate nationality', { nationalities: ['ES', 'ES'] }],
    ['six nationalities', { nationalities: ['ES', 'AR', 'PT', 'FR', 'IT', 'DE'] }],
    ['a birth year before 1900', { birthYear: 1899 }],
    ['no adults in the household', { householdAdults: 0 }],
    ['negative children', { dependentChildren: -1 }],
    ['an unknown employment status', { employmentStatus: 'ASTRONAUT' }],
    ['a blank name', { fullName: '  ' }],
  ])('rejects %s', (_label, change) => {
    expect(saveProfileRequest.safeParse({ ...profile, ...change }).success).toBe(false);
  });
});

describe('error bodies', () => {
  it('always carry a message, and optionally a code', () => {
    expect(apiErrorResponse.safeParse({ error: 'Not found' }).success).toBe(true);
    expect(apiErrorResponse.safeParse({ error: 'Down', code: ENCRYPTION_NOT_CONFIGURED }).success).toBe(true);
    expect(apiErrorResponse.safeParse({}).success).toBe(false);
  });

  it('list validation issues by path without values, and name overlapping phases', () => {
    expect(
      validationErrorResponse.safeParse({ error: 'Invalid request', issues: [{ path: 'endDate', message: 'Bad' }] }).success
    ).toBe(true);
    expect(
      phaseOverlapErrorResponse.safeParse({ error: 'Phases overlap', conflictingPhaseIds: ['a', 'b'] }).success
    ).toBe(true);
  });
});

describe('response shapes', () => {
  const amounts = Object.fromEntries(FIXED_COST_CATEGORIES.map((category) => [category, 0]));
  const basis = Object.fromEntries(FIXED_COST_CATEGORIES.map((category) => [category, { basis: null, billCount: 0 }]));

  it('describes a timeline entry with every category present', () => {
    const entry = {
      phaseId: 'p1',
      name: 'Madrid',
      city: 'Madrid',
      countryCode: 'ES',
      startDate: '2022-09-01',
      endDate: null,
      status: 'current',
      currency: 'EUR',
      monthlyIncomeMinor: 320000,
      monthlyFixedCostsMinor: 150000,
      savingsCapacityMinor: 170000,
      savingsRate: 0.53125,
      averageMonthlyIncomeMinor: 320000,
      averageSavingsCapacityMinor: 170000,
      averageSavingsRate: 0.53125,
      fixedCostsByCategoryMinor: amounts,
      costBasisByCategory: basis,
      months: 14.2,
      totalIncomeMinor: 4544000,
      totalFixedCostsMinor: 2130000,
    };

    expect(timelineResponse.safeParse({ asOf: '2026-10-31', entries: [entry] }).success).toBe(true);
    expect(
      timelineResponse.safeParse({
        asOf: '2026-10-31',
        entries: [{ ...entry, fixedCostsByCategoryMinor: { RENT: 1 } }],
      }).success
    ).toBe(false);
  });

  it('distinguishes a comparable result from one that needs exchange rates', () => {
    expect(
      phaseComparisonResponse.safeParse({ comparable: false, reason: 'FX_REQUIRED', currencies: ['EUR', 'ARS'] })
        .success
    ).toBe(true);
    expect(phaseComparisonResponse.safeParse({ comparable: false, reason: 'SOMETHING_ELSE' }).success).toBe(false);
  });
});
