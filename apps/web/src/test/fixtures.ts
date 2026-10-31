import type {
  BillingRecordDto,
  CurrencyWindowsDto,
  FixedCostDto,
  LivingPhaseDto,
  PhaseObservedDto,
  ProfileData,
  TimelineEntryDto,
  TrendsResponse,
  WindowAverageDto,
} from '../contracts';

export function makeCost(overrides: Partial<FixedCostDto> = {}): FixedCostDto {
  return { id: 'c1', category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000, label: null, notes: null, ...overrides };
}

export function makePhase(overrides: Partial<LivingPhaseDto> = {}): LivingPhaseDto {
  return {
    id: 'p1',
    name: 'Madrid',
    city: 'Madrid',
    address: null,
    countryCode: 'ES',
    tenure: 'RENT',
    startDate: '2022-09-01',
    endDate: null,
    currency: 'EUR',
    monthlyIncomeMinor: 320000,
    notes: null,
    fixedCosts: [makeCost()],
    ...overrides,
  };
}

export function makeEntry(overrides: Partial<TimelineEntryDto> = {}): TimelineEntryDto {
  return {
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
    fixedCostsByCategoryMinor: {
      RENT: 120000,
      ELECTRICITY: 15000,
      GAS: 0,
      WATER: 5000,
      INTERNET: 5000,
      PHONE: 0,
      SUBSCRIPTIONS: 5000,
      TAXES: 0,
      OTHER: 0,
    },
    months: 14,
    totalIncomeMinor: 4480000,
    totalFixedCostsMinor: 2100000,
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    fullName: 'Juan Doyle',
    birthYear: 1990,
    nationalities: ['AR', 'ES'],
    taxResidence: 'ES',
    householdAdults: 1,
    dependentChildren: 0,
    employmentStatus: 'EMPLOYEE',
    ...overrides,
  };
}

export function makeBill(overrides: Partial<BillingRecordDto> = {}): BillingRecordDto {
  return {
    id: 'b1',
    phaseId: 'p1',
    category: 'ELECTRICITY',
    cadence: 'BIMONTHLY',
    periodStart: '2026-07-15',
    periodEnd: '2026-09-14',
    amountMinor: 9600,
    vendor: 'Iberdrola',
    notes: null,
    currency: 'EUR',
    ...overrides,
  };
}

export function makeWindow(windowMonths: 3 | 6 | 12, overrides: Partial<WindowAverageDto> = {}): WindowAverageDto {
  return { windowMonths, totalMinor: windowMonths * 100000, coveredMonths: windowMonths, averageMinor: 100000, ...overrides };
}

export function makeWindows(currency = 'EUR', overrides: Partial<Record<3 | 6 | 12, Partial<WindowAverageDto>>> = {}): CurrencyWindowsDto {
  return { currency, windows: ([3, 6, 12] as const).map((months) => makeWindow(months, overrides[months])) };
}

export function makeObserved(overrides: Partial<PhaseObservedDto> = {}): PhaseObservedDto {
  return {
    phaseId: 'p1',
    name: 'Madrid',
    currency: 'EUR',
    coveredMonths: 5,
    observedMonthlyMinor: 131000,
    declaredMonthlyMinor: 129300,
    driftMinor: 1700,
    byCategoryMinor: {
      RENT: 120000,
      ELECTRICITY: 4800,
      GAS: 0,
      WATER: 1500,
      INTERNET: 4700,
      PHONE: 0,
      SUBSCRIPTIONS: 0,
      TAXES: 0,
      OTHER: 0,
    },
    ...overrides,
  };
}

export function makeTrends(overrides: Partial<TrendsResponse> = {}): TrendsResponse {
  return {
    asOf: '2026-10-31',
    lastCompleteMonth: '2026-09',
    fixedCosts: [makeWindows('EUR')],
    subscriptions: [makeWindows('EUR', { 3: { averageMinor: 1500 }, 6: { averageMinor: 1400 }, 12: { averageMinor: 1300 } })],
    phases: [makeObserved()],
    ...overrides,
  };
}

/** Trends with no bills behind any number. */
export function makeEmptyTrends(): TrendsResponse {
  const none = (currency: string) => makeWindows(currency, {
    3: { coveredMonths: 0, averageMinor: null, totalMinor: 0 },
    6: { coveredMonths: 0, averageMinor: null, totalMinor: 0 },
    12: { coveredMonths: 0, averageMinor: null, totalMinor: 0 },
  });
  return { asOf: '2026-10-31', lastCompleteMonth: '2026-09', fixedCosts: [none('EUR')], subscriptions: [none('EUR')], phases: [] };
}
