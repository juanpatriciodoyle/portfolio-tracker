import type { BenchmarksResponse, PhaseBenchmarkDto, StandingDto } from '../contracts';

const CITATION = { name: 'Eurostat, EU-SILC', url: 'https://ec.europa.eu/eurostat', retrievedAt: '2026-10-20T08:00:00.000Z' };
const WORLD_CITATION = { name: 'World Bank, Poverty and Inequality Platform (2021 PPP round)', url: 'https://pip.worldbank.org', retrievedAt: '2026-06-01T08:00:00.000Z' };

/** Where the default phase stands: the country, the EU and the world. */
export const DEFAULT_STANDING: StandingDto[] = [
  { scope: 'COUNTRY', areaCode: 'ES', areaName: null, percentile: 88.7, bound: 'EXACT', period: '2025', source: 'EUROSTAT', basis: 'EQUIVALISED', measuredAs: 'NATIONAL_INCOME', yourValue: null, citation: CITATION },
  { scope: 'CONTINENT', areaCode: 'EU', areaName: 'the EU', percentile: 85.1, bound: 'EXACT', period: '2025', source: 'EUROSTAT', basis: 'EQUIVALISED', measuredAs: 'EURO_INCOME', yourValue: 38400, citation: CITATION },
  { scope: 'WORLD', areaCode: 'WLD', areaName: 'the world', percentile: 97.9, bound: 'EXACT', period: '2024', source: 'WORLD_BANK', basis: 'PER_CAPITA', measuredAs: 'DOLLARS_PER_DAY_2021', yourValue: 147.3, citation: WORLD_CITATION },
];

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
    continentHousing: {
      housingMonthlyMinor: 137100,
      yourSharePercent: 42.8,
      typicalSharePercent: 18.9,
      differencePoints: 23.9,
      verdict: 'HIGHER',
      period: '2025',
      source: 'EUROSTAT',
      areaCode: 'EU',
      areaName: 'the EU',
    },
    standing: DEFAULT_STANDING,
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
