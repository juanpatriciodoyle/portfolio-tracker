import type { BenchmarksResponse, PhaseBenchmarkDto } from '../contracts';

export function makePhaseBenchmark(overrides: Partial<PhaseBenchmarkDto> = {}): PhaseBenchmarkDto {
  return {
    phaseId: 'p1',
    name: 'Madrid',
    countryCode: 'ES',
    currency: 'EUR',
    monthlyIncomeMinor: 320000,
    household: { adults: 1, children: 0 },
    incomePercentile: { percentile: 88.7, bound: 'EXACT', period: '2025', source: 'EUROSTAT', basis: 'EQUIVALISED' },
    housingBurden: {
      housingMonthlyMinor: 137100,
      yourSharePercent: 42.8,
      typicalSharePercent: 16,
      differencePoints: 26.8,
      verdict: 'HIGHER',
      period: '2025',
      source: 'EUROSTAT',
    },
    purchasingPower: {
      internationalDollarsPerMonth: 5604.29,
      versusPreviousPhase: { phaseId: 'p0', ratio: 1.59 },
      versusNationalAverage: 1.4,
      period: '2025',
      source: 'WORLD_BANK',
    },
    nationalityEquivalences: [],
    gaps: [],
    ...overrides,
  };
}

export function makeBenchmarks(overrides: Partial<BenchmarksResponse> = {}): BenchmarksResponse {
  return { asOf: '2026-10-31', refreshedAt: '2026-10-20T08:00:00.000Z', phases: [makePhaseBenchmark()], ...overrides };
}
