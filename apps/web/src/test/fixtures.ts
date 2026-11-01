import {
  FIXED_COST_CATEGORIES,
  type BillingRecordDto,
  type FixedCostDto,
  type LivingPhaseDto,
  type CapitalHorizonResponse,
  type CapitalMilestonePacingDto,
  type ProfileData,
  type SecondSalaryResponse,
  type TimelineEntryDto,
} from '../contracts';

export function makeCost(overrides: Partial<FixedCostDto> = {}): FixedCostDto {
  return { id: 'c1', category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000, label: null, notes: null, endDate: null, ...overrides };
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
    incomeStreams: [{ label: 'Salary', amountMinor: 320000, startDate: '2022-09-01', endDate: null }],
    notes: null,
    fixedCosts: [makeCost()],
    ...overrides,
  };
}

/** Every category with nothing declared or billed: tests overwrite the ones they care about. */
export function noBasis(overrides: Partial<TimelineEntryDto['costBasisByCategory']> = {}): TimelineEntryDto['costBasisByCategory'] {
  return {
    ...(Object.fromEntries(FIXED_COST_CATEGORIES.map((category) => [category, { basis: null, billCount: 0 }])) as TimelineEntryDto['costBasisByCategory']),
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
    averageMonthlyIncomeMinor: 320000,
    averageSavingsCapacityMinor: 170000,
    averageSavingsRate: 0.53125,
    fixedCostsByCategoryMinor: {
      RENT: 120000,
      ELECTRICITY: 15000,
      GAS: 0,
      WATER: 5000,
      HEATING_COOLING: 0,
      INTERNET: 5000,
      PHONE: 0,
      SUBSCRIPTIONS: 5000,
      TAXES: 0,
      OTHER: 0,
    },
    costBasisByCategory: noBasis(),
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

/** €1,000 a month from €200,000: covers utilities & subscriptions (€300) and rent (€900), not the €1,500 of living costs. */
export function makeSecondSalary(overrides: Partial<SecondSalaryResponse> = {}): SecondSalaryResponse {
  return {
    asOf: '2026-10-31',
    currency: 'EUR',
    capitalMinor: 20_000_000,
    annualYield: 0.06,
    secondSalaryMinor: 100_000,
    milestones: [
      { id: 1, kind: 'UTILITIES_AND_SUBSCRIPTIONS', monthlyCostMinor: 30_000, capitalNeededMinor: 6_000_000, reached: true, progress: 1, position: 0.06 },
      { id: 2, kind: 'RENT', monthlyCostMinor: 90_000, capitalNeededMinor: 18_000_000, reached: true, progress: 1, position: 0.18 },
      { id: 3, kind: 'LIVING_COST', monthlyCostMinor: 150_000, capitalNeededMinor: 30_000_000, reached: false, progress: 100_000 / 150_000, position: 0.3 },
    ],
    reachedMilestone: 2,
    gap: null,
    target: { minMonthlyMinor: 300_000, maxMonthlyMinor: 500_000, progress: 0.2, minMarker: 0.6, reachedMin: false, minCapitalNeededMinor: 60_000_000, maxCapitalNeededMinor: 100_000_000 },
    ...overrides,
  };
}

/** A €350,000 property needing 30% (€105,000), with €80,000 held and €2,000 left over each month: 13 months away. */
export function makePacedMilestone(overrides: Partial<CapitalMilestonePacingDto> = {}): CapitalMilestonePacingDto {
  return {
    id: 'm1',
    title: 'Property Down Payment',
    targetAmountMinor: 35_000_000,
    capitalRequiredPercentage: 30,
    category: 'PROPERTY',
    enabled: true,
    capitalNeededMinor: 10_500_000,
    capitalGapMinor: 2_500_000,
    monthsRemaining: 13,
    achieved: false,
    progress: 8_000_000 / 10_500_000,
    ...overrides,
  };
}

export function makeCapitalHorizon(overrides: Partial<CapitalHorizonResponse> = {}): CapitalHorizonResponse {
  return {
    asOf: '2026-10-31',
    currency: 'EUR',
    liquidPortfolioMinor: 8_000_000,
    monthlySurplusMinor: 200_000,
    gap: null,
    milestones: [makePacedMilestone()],
    ...overrides,
  };
}
