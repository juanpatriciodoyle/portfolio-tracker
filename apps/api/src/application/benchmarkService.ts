import type { BenchmarkGap, BenchmarksResponse, CalendarDate, PhaseBenchmarkDto } from '../contracts';
import { compareShare, housingCostsMinor, housingShare, incomePercentile, internationalDollars, ratioOf, type Household } from '../domain/benchmarks';
import { isLocalCurrency } from '../domain/countryCurrencies';
import { phaseSnapshot } from '../domain/livingPhase';
import type { CountryStatisticsService } from './countryStatisticsService';
import type { LivingPhaseService } from './livingPhaseService';
import type { ProfileService } from './profileService';
import type { CountryStatistics } from './ports';

export interface BenchmarkServiceDeps {
  readonly phases: LivingPhaseService;
  readonly profiles: ProfileService;
  readonly statistics: CountryStatisticsService;
}

/** Compares each of a person's living phases with what public statistics say about the country it is in. A query: it changes nothing of theirs. */
export class BenchmarkService {
  constructor(private readonly deps: BenchmarkServiceDeps) {}

  async benchmarks(userId: string, asOf: CalendarDate): Promise<BenchmarksResponse> {
    const [loaded, profile] = await Promise.all([this.deps.phases.loadPhases(userId), this.deps.profiles.getProfile(userId)]);
    const household: Household = { adults: profile.householdAdults, children: profile.dependentChildren };

    const countries = [...new Set(loaded.map(({ dto }) => dto.countryCode))];
    const stored = new Map(await Promise.all(countries.map(async (code) => [code, await this.deps.statistics.get(code)] as const)));

    const phases: PhaseBenchmarkDto[] = [];
    let previousPurchasing: { phaseId: string; dollars: number } | null = null;
    for (const { dto, phase } of loaded) {
      const snapshot = phaseSnapshot(phase, asOf);
      const statistics = stored.get(dto.countryCode)?.statistics ?? null;
      const benchmark = benchmarkPhase({
        phaseId: dto.id,
        name: dto.name,
        countryCode: dto.countryCode,
        currency: dto.currency,
        monthlyIncomeMinor: snapshot.monthlyIncomeMinor,
        monthlyByCategory: snapshot.fixedCostsByCategoryMinor,
        household,
        statistics,
        previousPurchasing,
      });
      phases.push(benchmark);
      if (benchmark.purchasingPower) previousPurchasing = { phaseId: dto.id, dollars: benchmark.purchasingPower.internationalDollarsPerMonth };
    }

    const fetched = [...stored.values()].flatMap((entry) => (entry ? [entry.fetchedAt] : []));
    return { asOf, refreshedAt: fetched.length > 0 ? fetched.sort()[0] : null, phases };
  }
}

interface PhaseFacts {
  readonly phaseId: string;
  readonly name: string;
  readonly countryCode: string;
  readonly currency: string;
  readonly monthlyIncomeMinor: number;
  readonly monthlyByCategory: Parameters<typeof housingCostsMinor>[0];
  readonly household: Household;
  readonly statistics: CountryStatistics | null;
  readonly previousPurchasing: { phaseId: string; dollars: number } | null;
}

function benchmarkPhase(facts: PhaseFacts): PhaseBenchmarkDto {
  const { statistics, currency, monthlyIncomeMinor, household } = facts;
  const gaps: BenchmarkGap[] = [];
  const hasIncome = monthlyIncomeMinor > 0;
  if (!hasIncome) gaps.push('NO_INCOME');

  let incomePercentileDto: PhaseBenchmarkDto['incomePercentile'] = null;
  const income = statistics?.incomeDistribution ?? null;
  if (hasIncome) {
    if (!income) gaps.push('NO_DISTRIBUTION');
    else if (income.currency !== currency) gaps.push('CURRENCY_MISMATCH');
    else {
      const position = incomePercentile(income.distribution, monthlyIncomeMinor, household);
      if (position) incomePercentileDto = { ...position, period: income.period, source: income.source, basis: income.distribution.basis };
    }
  }

  let housingBurden: PhaseBenchmarkDto['housingBurden'] = null;
  const typical = statistics?.housingCostShare ?? null;
  if (hasIncome) {
    if (!typical) gaps.push('NO_HOUSING_BASELINE');
    else {
      const housingMonthlyMinor = housingCostsMinor(facts.monthlyByCategory);
      const yourSharePercent = housingShare(housingMonthlyMinor, monthlyIncomeMinor) as number;
      housingBurden = {
        housingMonthlyMinor,
        yourSharePercent,
        typicalSharePercent: typical.percent,
        ...compareShare(yourSharePercent, typical.percent),
        period: typical.period,
        source: typical.source,
      };
    }
  }

  let purchasingPower: PhaseBenchmarkDto['purchasingPower'] = null;
  const ppp = statistics?.purchasing ?? null;
  if (hasIncome) {
    if (!ppp) gaps.push('NO_PURCHASING_POWER');
    else if (!isLocalCurrency(facts.countryCode, currency)) gaps.push('CURRENCY_MISMATCH');
    else {
      const dollars = internationalDollars(monthlyIncomeMinor, currency, ppp.lcuPerInternationalDollar);
      if (dollars === null) gaps.push('NO_PURCHASING_POWER');
      else {
        const previous = facts.previousPurchasing;
        const people = household.adults + household.children;
        purchasingPower = {
          internationalDollarsPerMonth: dollars,
          versusPreviousPhase: previous ? { phaseId: previous.phaseId, ratio: ratioOf(dollars, previous.dollars) as number } : null,
          versusNationalAverage: ppp.gniPerPersonDollars ? ratioOf((dollars * 12) / people, ppp.gniPerPersonDollars) : null,
          period: ppp.period,
          source: ppp.source,
        };
      }
    }
  }

  return {
    phaseId: facts.phaseId,
    name: facts.name,
    countryCode: facts.countryCode,
    currency,
    monthlyIncomeMinor,
    household,
    incomePercentile: incomePercentileDto,
    housingBurden,
    purchasingPower,
    gaps: [...new Set(gaps)],
  };
}
