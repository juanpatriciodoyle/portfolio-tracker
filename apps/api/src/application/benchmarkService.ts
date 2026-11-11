import type { BenchmarkGap, BenchmarksResponse, CalendarDate, NationalityEquivalenceDto, PhaseBenchmarkDto, StandingDto } from '../contracts';
import { compareShare, equivalentIncomeMinor, housingCostsMinor, housingShare, incomePerPerson, incomePercentile, internationalDollars, ratioOf, type Household } from '../domain/benchmarks';
import { isLocalCurrency, localCurrencyOf } from '../domain/countryCurrencies';
import { WORLD_AREA, continentAreaOf, convertAmountMinor, percentileAmong, referenceDollarsPerDay, type ReferenceArea } from '../domain/standing';
import { phaseSnapshot } from '../domain/livingPhase';
import type { CountryStatisticsService } from './countryStatisticsService';
import type { LivingPhaseService } from './livingPhaseService';
import type { ProfileService } from './profileService';
import type { CountryStatistics, FxRateProvider, StoredCountryStatistics } from './ports';
import { incomeCitation } from './sourceCitations';

export interface BenchmarkServiceDeps {
  readonly phases: LivingPhaseService;
  readonly profiles: ProfileService;
  readonly statistics: CountryStatisticsService;
  /** To bring an income in a foreign currency to the euro (the EU) or to the country's own currency (the world). Without it such incomes are left out. */
  readonly fx?: FxRateProvider;
}

/** Compares each of a person's living phases with what public statistics say about the country it is in. A query: it changes nothing of theirs. */
export class BenchmarkService {
  constructor(private readonly deps: BenchmarkServiceDeps) {}

  async benchmarks(userId: string, asOf: CalendarDate): Promise<BenchmarksResponse> {
    const [loaded, profile] = await Promise.all([this.deps.phases.loadPhases(userId), this.deps.profiles.getProfile(userId)]);
    const household: Household = { adults: profile.householdAdults, children: profile.dependentChildren };

    const countries = [...new Set([...loaded.map(({ dto }) => dto.countryCode), ...profile.nationalities])];
    const stored = new Map(await Promise.all(countries.map(async (code) => [code, await this.deps.statistics.get(code)] as const)));

    // The areas the phases are compared with: each fetched once, however many phases share it.
    const areaOf = new Map(loaded.map(({ dto }) => [dto.countryCode, continentAreaOf(dto.countryCode, stored.get(dto.countryCode)?.statistics.regionCode ?? null)] as const));
    const areaCodes = [...new Set([WORLD_AREA.code, ...[...areaOf.values()].flatMap((area) => (area ? [area.code] : []))])];
    const areas = new Map(await Promise.all(areaCodes.map(async (code) => [code, await this.deps.statistics.cached(code).catch(() => null)] as const)));

    const phases: PhaseBenchmarkDto[] = [];
    let previousPurchasing: { phaseId: string; dollars: number } | null = null;
    for (const { dto, phase } of loaded) {
      const snapshot = phaseSnapshot(phase, asOf);
      const statistics = stored.get(dto.countryCode)?.statistics ?? null;
      const continent = areaOf.get(dto.countryCode) ?? null;
      const benchmark = benchmarkPhase({
        phaseId: dto.id,
        name: dto.name,
        countryCode: dto.countryCode,
        currency: dto.currency,
        monthlyIncomeMinor: snapshot.monthlyIncomeMinor,
        monthlyByCategory: snapshot.fixedCostsByCategoryMinor,
        household,
        statistics,
        retrievedAt: stored.get(dto.countryCode)?.fetchedAt ?? '',
        continent: continent ? { area: continent, stored: areas.get(continent.code) ?? null } : null,
        world: areas.get(WORLD_AREA.code) ?? null,
        rates: await this.ratesFor(dto.currency, dto.countryCode, asOf),
        previousPurchasing,
      });
      const nationalityEquivalences = nationalityEquivalencesOf(benchmark, profile.nationalities, household, stored);
      phases.push({ ...benchmark, nationalityEquivalences });
      if (benchmark.purchasingPower) previousPurchasing = { phaseId: dto.id, dollars: benchmark.purchasingPower.internationalDollarsPerMonth };
    }

    const fetched = [...stored.values()].flatMap((entry) => (entry ? [entry.fetchedAt] : []));
    return { asOf, refreshedAt: fetched.length > 0 ? fetched.sort()[0] : null, phases };
  }

  /** The euro value of the phase's currency and of the country's own: what converting an income needs. Empty when unknown. */
  private async ratesFor(currency: string, countryCode: string, asOf: CalendarDate): Promise<Readonly<Record<string, number>>> {
    const wanted = [...new Set([currency, 'EUR', localCurrencyOf(countryCode) ?? currency])];
    if (!this.deps.fx || wanted.length === 1) return { EUR: 1 };
    try {
      return { EUR: 1, ...(await this.deps.fx.ratesFor(wanted, asOf)).rates };
    } catch {
      return { EUR: 1 };
    }
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
  /** When the country's statistics were fetched. */
  readonly retrievedAt: string;
  /** The EU or World Bank region the country is compared with, and what is known about it. */
  readonly continent: { readonly area: ReferenceArea; readonly stored: StoredCountryStatistics | null } | null;
  readonly world: StoredCountryStatistics | null;
  /** The euro value of one unit of the currencies that may need converting. */
  readonly rates: Readonly<Record<string, number>>;
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

  const standing: StandingDto[] = [];
  if (incomePercentileDto) {
    standing.push({
      scope: 'COUNTRY',
      areaCode: facts.countryCode,
      areaName: null,
      ...incomePercentileDto,
      measuredAs: 'NATIONAL_INCOME',
      yourValue: null,
      citation: incomeCitation(incomePercentileDto.source, facts.retrievedAt),
    });
  }

  let continentHousing: PhaseBenchmarkDto['continentHousing'] = null;
  if (hasIncome) {
    const continent = placeInContinent(facts);
    if (continent.standing) standing.push(continent.standing);
    if (continent.gap) gaps.push(continent.gap);
    continentHousing = continent.housing;

    const worldRung = placeInWorld(facts);
    if (worldRung.standing) standing.push(worldRung.standing);
    if (worldRung.gap) gaps.push(worldRung.gap);
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
    continentHousing,
    standing,
    purchasingPower,
    nationalityEquivalences: [],
    gaps: [...new Set(gaps)],
  };
}

/** The income in the currency a country's PPP factor is in; null when it cannot be converted. */
function incomeInLocalCurrency(facts: PhaseFacts): number | null {
  const local = localCurrencyOf(facts.countryCode) ?? facts.currency;
  return convertAmountMinor(facts.monthlyIncomeMinor, facts.currency, local, facts.rates);
}

/**
 * The income in international dollars per person per day at 2021 prices, the unit of the World Bank's distributions.
 * Dollar prices are brought back to 2021 from the year of the country's PPP factor.
 */
function dollarsPerDay(facts: PhaseFacts, priceIndex: Readonly<Record<string, number>>): number | null | 'NO_PPP' {
  const purchasing = facts.statistics?.purchasing;
  if (!purchasing) return 'NO_PPP';
  const years = Object.keys(priceIndex).sort();
  if (years.length === 0 || purchasing.period < years[0]) return null;
  const year = [...years].reverse().find((candidate) => candidate <= purchasing.period) ?? years[0];
  const local = incomeInLocalCurrency(facts);
  if (local === null) return null;
  return referenceDollarsPerDay({
    monthlyIncomeMinor: local,
    currency: localCurrencyOf(facts.countryCode) ?? facts.currency,
    household: facts.household,
    lcuPerInternationalDollar: purchasing.lcuPerInternationalDollar,
    priceIndexSince2021: priceIndex[year],
  });
}

interface Placed {
  readonly standing: StandingDto | null;
  readonly gap: BenchmarkGap | null;
}

function placeAmongPeopleOfAnArea(facts: PhaseFacts, area: ReferenceArea, stored: StoredCountryStatistics | null, scope: 'CONTINENT' | 'WORLD', missing: BenchmarkGap): Placed {
  const reference = stored?.statistics.referenceDistribution;
  if (!reference) return { standing: null, gap: missing };
  const dollars = dollarsPerDay(facts, reference.priceIndex);
  if (dollars === 'NO_PPP') return { standing: null, gap: 'NO_PURCHASING_POWER' };
  if (dollars === null) return { standing: null, gap: 'CURRENCY_MISMATCH' };
  const position = percentileAmong(reference.points, dollars);
  if (!position) return { standing: null, gap: missing };
  return {
    standing: {
      scope,
      areaCode: area.code,
      areaName: area.name,
      ...position,
      period: reference.period,
      source: reference.source,
      basis: 'PER_CAPITA',
      measuredAs: 'DOLLARS_PER_DAY_2021',
      yourValue: Math.round(dollars * 100) / 100,
      citation: incomeCitation(reference.source, (stored as StoredCountryStatistics).fetchedAt),
    },
    gap: null,
  };
}

function placeInWorld(facts: PhaseFacts): Placed {
  return placeAmongPeopleOfAnArea(facts, WORLD_AREA, facts.world, 'WORLD', 'NO_WORLD_REFERENCE');
}

/** The EU is compared in euros, like Eurostat publishes it; a World Bank region in international dollars like the world. */
function placeInContinent(facts: PhaseFacts): Placed & { readonly housing: PhaseBenchmarkDto['continentHousing'] } {
  const { continent } = facts;
  if (!continent) return { standing: null, gap: 'NO_CONTINENT_REFERENCE', housing: null };
  if (continent.area.code !== 'EU') return { ...placeAmongPeopleOfAnArea(facts, continent.area, continent.stored, 'CONTINENT', 'NO_CONTINENT_REFERENCE'), housing: null };

  const statistics = continent.stored?.statistics;
  const income = statistics?.incomeDistribution;
  if (!statistics || !income) return { standing: null, gap: 'NO_CONTINENT_REFERENCE', housing: null };

  const typical = statistics.housingCostShare;
  const yourSharePercent = housingShare(housingCostsMinor(facts.monthlyByCategory), facts.monthlyIncomeMinor);
  const housing =
    typical && yourSharePercent !== null
      ? {
          housingMonthlyMinor: housingCostsMinor(facts.monthlyByCategory),
          yourSharePercent,
          typicalSharePercent: typical.percent,
          ...compareShare(yourSharePercent, typical.percent),
          period: typical.period,
          source: typical.source,
          areaCode: continent.area.code,
          areaName: continent.area.name,
        }
      : null;

  const euros = convertAmountMinor(facts.monthlyIncomeMinor, facts.currency, income.currency, facts.rates);
  if (euros === null) return { standing: null, gap: 'CURRENCY_MISMATCH', housing };
  const position = incomePercentile(income.distribution, euros, facts.household);
  if (!position) return { standing: null, gap: 'NO_CONTINENT_REFERENCE', housing };
  return {
    standing: {
      scope: 'CONTINENT',
      areaCode: continent.area.code,
      areaName: continent.area.name,
      ...position,
      period: income.period,
      source: income.source,
      basis: income.distribution.basis,
      measuredAs: 'EURO_INCOME',
      yourValue: Math.round(incomePerPerson(euros, facts.household, income.distribution.basis) * (income.distribution.period === 'YEAR' ? 12 : 1)) / 100,
      citation: incomeCitation(income.source, (continent.stored as StoredCountryStatistics).fetchedAt),
    },
    gap: null,
    housing,
  };
}

/**
 * What a phase's income would be worth in the country of each other nationality, by purchasing power, and where that
 * sits among people there. A country that publishes no price level is left out: nothing is guessed.
 */
function nationalityEquivalencesOf(
  benchmark: PhaseBenchmarkDto,
  nationalities: readonly string[],
  household: Household,
  stored: ReadonlyMap<string, { readonly statistics: CountryStatistics } | null>
): NationalityEquivalenceDto[] {
  if (!benchmark.purchasingPower) return [];
  const dollars = benchmark.purchasingPower.internationalDollarsPerMonth;
  return nationalities.flatMap((countryCode) => {
    const statistics = stored.get(countryCode)?.statistics;
    const currency = localCurrencyOf(countryCode);
    if (countryCode === benchmark.countryCode || !statistics?.purchasing || !currency) return [];
    const equivalentMonthlyIncomeMinor = equivalentIncomeMinor(dollars, currency, statistics.purchasing.lcuPerInternationalDollar);
    if (equivalentMonthlyIncomeMinor === null) return [];

    const income = statistics.incomeDistribution;
    const position = income && income.currency === currency ? incomePercentile(income.distribution, equivalentMonthlyIncomeMinor, household) : null;
    return [
      {
        countryCode,
        currency,
        equivalentMonthlyIncomeMinor,
        incomePercentile: position && income ? { ...position, period: income.period, source: income.source, basis: income.distribution.basis } : null,
      },
    ];
  });
}
