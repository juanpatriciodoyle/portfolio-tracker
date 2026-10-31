import type { FixedCostDto, LivingPhaseDto, ProfileData, TimelineEntryDto } from '../contracts';

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
