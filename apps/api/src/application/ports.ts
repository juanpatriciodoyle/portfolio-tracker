import type { BillingCadence, CalendarDate, CostCadence, FixedCostCategory, FxRateSource, HousingTenure } from '../contracts/vocabulary';
import type { BenchmarkSource } from '../contracts/benchmark';
import type { IncomeDistribution } from '../domain/benchmarks';
import type { FxRates } from '../domain/phaseComparison';

/** Where a stored value lives. Bound into every ciphertext so a value cannot be moved to another row or person. */
export interface CipherContext {
  readonly table: string;
  readonly rowId: string;
  readonly userId: string;
}

/** Port: encrypts and decrypts sensitive fields. The core never knows which algorithm or key is behind it. */
export interface FieldCipher {
  encrypt(plaintext: string, context: CipherContext): string;
  /** Throws if the value was tampered with, belongs to another context, or was made with another key. */
  decrypt(ciphertext: string, context: CipherContext): string;
}

/** A fixed cost as persisted: category and cadence stay readable, everything personal is sealed in `payload`. */
export interface StoredFixedCost {
  readonly id: string;
  readonly category: FixedCostCategory;
  readonly cadence: CostCadence;
  readonly payload: string;
}

/** A living phase as persisted: dates, currency, country and tenure stay readable so they can be ordered and joined. */
export interface StoredLivingPhase {
  readonly id: string;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate | null;
  readonly currency: string;
  readonly countryCode: string;
  readonly tenure: HousingTenure;
  readonly payload: string;
  readonly fixedCosts: readonly StoredFixedCost[];
}

/** Fields left out are unchanged; `endDate: null` clears the end date. */
export type StoredPhaseChange = Partial<Omit<StoredLivingPhase, 'id' | 'fixedCosts'>>;
export type StoredCostChange = Partial<Omit<StoredFixedCost, 'id'>>;

/** Port: persistence of living phases. Every call is scoped to one user; foreign rows simply do not exist. */
export interface LivingPhaseRepository {
  /** Oldest phase first. */
  list(userId: string): Promise<StoredLivingPhase[]>;
  find(userId: string, phaseId: string): Promise<StoredLivingPhase | null>;
  /** Saves every phase or none of them. */
  createMany(userId: string, phases: readonly StoredLivingPhase[]): Promise<void>;
  /** The mutations below answer false when the user has no such phase (or cost). */
  update(userId: string, phaseId: string, change: StoredPhaseChange): Promise<boolean>;
  delete(userId: string, phaseId: string): Promise<boolean>;
  addFixedCost(userId: string, phaseId: string, cost: StoredFixedCost): Promise<boolean>;
  updateFixedCost(userId: string, phaseId: string, costId: string, change: StoredCostChange): Promise<boolean>;
  deleteFixedCost(userId: string, phaseId: string, costId: string): Promise<boolean>;
}

/** A bill as persisted: category, cadence and period stay readable, vendor, amount and notes are sealed in `payload`. */
export interface StoredBillingRecord {
  readonly id: string;
  readonly phaseId: string;
  readonly category: FixedCostCategory;
  readonly cadence: BillingCadence;
  readonly periodStart: CalendarDate;
  readonly periodEnd: CalendarDate;
  readonly payload: string;
  /** Keyed hash of what makes the bill unique (see BillFingerprinter); null for bills recorded before it existed. */
  readonly fingerprint: string | null;
}

/** Fields left out are unchanged. A bill never moves to another phase. */
export type StoredBillingRecordChange = Partial<Omit<StoredBillingRecord, 'id' | 'phaseId'>>;

/** Port: persistence of bills. Scoped to one user; bills of a deleted phase are gone with it. */
export interface BillingRecordRepository {
  /** Newest period first. */
  list(userId: string, filter?: { phaseId?: string }): Promise<StoredBillingRecord[]>;
  find(userId: string, recordId: string): Promise<StoredBillingRecord | null>;
  /** 'phase-missing' when the user has no such phase; 'duplicate' when the person already holds that fingerprint. */
  create(userId: string, record: StoredBillingRecord): Promise<'created' | 'phase-missing' | 'duplicate'>;
  update(userId: string, recordId: string, change: StoredBillingRecordChange): Promise<'updated' | 'missing' | 'duplicate'>;
  /** The id of the person's bill with this fingerprint, if any. */
  findIdByFingerprint(userId: string, fingerprint: string): Promise<string | null>;
  delete(userId: string, recordId: string): Promise<boolean>;
}

/** Exchange rates for some currencies on some day, each with where it came from. */
export interface FxQuote {
  /** The value of one unit of each currency in euros (EUR itself is 1). */
  readonly rates: FxRates;
  /** Only for the currencies that needed a rate; says whether it is an ECB, official BCRA or approximate reference rate. */
  readonly sources: Readonly<Record<string, FxRateSource>>;
}

/** Port: where exchange rates come from. Never throws for a currency it cannot price: it leaves it out. */
export interface FxRateProvider {
  ratesFor(currencies: readonly string[], on: CalendarDate): Promise<FxQuote>;
}

export interface StoredProfile {
  readonly payload: string;
}

/** Port: persistence of the one profile each user has. */
export interface ProfileRepository {
  find(userId: string): Promise<StoredProfile | null>;
  save(userId: string, payload: string): Promise<void>;
}

/** Port: turns what identifies a bill into an opaque, per-person value that can be compared and stored. */
export interface BillFingerprinter {
  fingerprint(userId: string, identity: string): string;
}

/**
 * Port: turns the bytes of a PDF into its text. The reader itself enforces the page limit and a time limit, and
 * throws a DocumentRejectedError for a document it will not read. It must not write the document anywhere.
 */
export interface PdfTextExtractor {
  extract(pdf: Uint8Array): Promise<{ pages: number; text: string }>;
}

/** Which statistic, from whom, and for which period (such as "2025" or "2026-Q1"). */
export interface StatisticOrigin {
  readonly source: BenchmarkSource;
  readonly period: string;
}

/** What is known about a country from public statistics. Each part is null when no provider published it. */
export interface CountryStatistics {
  readonly countryCode: string;
  readonly incomeDistribution: (StatisticOrigin & { readonly currency: string; readonly distribution: IncomeDistribution }) | null;
  /** Typical share of disposable income that households spend on housing, in percent. */
  readonly housingCostShare: (StatisticOrigin & { readonly percent: number }) | null;
  /** PPP conversion factor: local currency units per international dollar, and GNI per person in international dollars. */
  readonly purchasing: (StatisticOrigin & { readonly lcuPerInternationalDollar: number; readonly gniPerPersonDollars: number | null }) | null;
}

export type StatisticsFragment = Partial<Omit<CountryStatistics, 'countryCode'>>;

/** Port: one public source of statistics. Answers only what it publishes; throws when it cannot be reached. */
export interface StatisticsProvider {
  readonly name: string;
  supports(countryCode: string): boolean;
  fetch(countryCode: string): Promise<StatisticsFragment>;
}

export interface StoredCountryStatistics {
  readonly statistics: CountryStatistics;
  /** When the providers were last asked, as an ISO timestamp. */
  readonly fetchedAt: string;
}

/** Port: the cache of country statistics. Public data, shared by everyone, so nothing here is personal. */
export interface CountryStatisticsRepository {
  find(countryCode: string): Promise<StoredCountryStatistics | null>;
  save(stored: StoredCountryStatistics): Promise<void>;
}

/** Port: makes sure a task runs on one server at a time, across all of them. */
export interface JobLock {
  runExclusive(name: string, task: () => Promise<void>): Promise<'ran' | 'skipped'>;
}

/** Port: what a person's portfolio is worth now, in one currency. Read-only. */
export interface PortfolioValueReader {
  netWorth(userId: string): Promise<{ readonly amountMinor: number; readonly currency: string }>;
}
