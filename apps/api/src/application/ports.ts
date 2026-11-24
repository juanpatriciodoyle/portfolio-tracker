import type { BillingCadence, CalendarDate, CostCadence, FixedCostCategory, FxRateSource, HousingTenure } from '../contracts/vocabulary';
import type { BenchmarkSource } from '../contracts/benchmark';
import type { DistributionPoint, IncomeDistribution } from '../domain/benchmarks';
import type { FxRates } from '../domain/phaseComparison';
import type { NewUserDefaults } from '../domain/newUser';
import type { RebuiltInstrument } from '../domain/ledgerAmendment';
import type { PortfolioSnapshot } from '../domain/portfolioSnapshots';
import type { TransactionPlan } from '../domain/transactionPlan';

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

/**
 * How much people have per person per day across an area (the world, a World Bank region), as a distribution of
 * international dollars at 2021 prices (the 2021 PPP round). Each point is the share of people below a given amount.
 */
export interface ReferenceDistribution extends StatisticOrigin {
  readonly areaName: string;
  readonly points: readonly DistributionPoint[];
  /** How much dollar prices rose from 2021 to each year (the US consumer price index of the year over that of 2021). */
  readonly priceIndex: Readonly<Record<string, number>>;
}

/**
 * What is known about a country (or an area such as 'EU', 'WLD' or 'LCN') from public statistics. Each part is null
 * when no provider published it.
 */
export interface CountryStatistics {
  readonly countryCode: string;
  /** The World Bank region of a country (such as 'LCN'); null for areas and when unknown. */
  readonly regionCode: string | null;
  /** How people in a whole area are spread: only kept for the world and the World Bank regions. */
  readonly referenceDistribution: ReferenceDistribution | null;
  readonly incomeDistribution: (StatisticOrigin & { readonly currency: string; readonly distribution: IncomeDistribution }) | null;
  /** Typical share of disposable income that households spend on housing, in percent. */
  readonly housingCostShare: (StatisticOrigin & { readonly percent: number }) | null;
  /**
   * Typical share of disposable income that households which pay rent spend on it, in percent: the like-for-like
   * figure for a tenant (the housing share above blends in owners who pay no rent).
   */
  readonly rentCostShare: (StatisticOrigin & { readonly percent: number }) | null;
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

/** Port: today's market prices. A symbol the market does not know is simply absent from the answer. */
export interface PriceProvider {
  /** Price per unit of each symbol, in `currency`. */
  pricesFor(symbols: readonly string[], currency: string): Promise<ReadonlyMap<string, number>>;
}

/** Who a sign-in resolves to: the account id, where they live and whether a passkey is registered. Never their email, which is not stored. */
export interface AuthUser {
  readonly id: string;
  readonly country: string;
  readonly hasPasskey: boolean;
  /** A demo account: it lasts at most an hour, can never hold a passkey, and is never a customer. */
  readonly isGuest: boolean;
}

/** Port: persistence of accounts. Accounts are found by the hash of an identity, never by the identity itself. */
export interface UserRepository {
  findByIdentityHash(userHash: string): Promise<AuthUser | null>;
  findById(userId: string): Promise<AuthUser | null>;
  create(userHash: string, defaults: NewUserDefaults): Promise<AuthUser>;
  /** Command: the account signed in at `at`. */
  recordLogin(userId: string, at: Date): Promise<void>;
  /** The hash an account is stored under, or null when there is no such account. */
  identityHashOf(userId: string): Promise<string | null>;
}

/** Who administers the app, known only by the hash of their email. */
export interface AdminDirectory {
  isAdmin(userHash: string): boolean;
}

/** Port: how many people use the app. The demo guest is not a customer. */
export interface UsageStatistics {
  countCustomers(): Promise<number>;
  countCustomersSignedInSince(since: Date): Promise<number>;
}

/** What Google confirmed about a person. The email is one Google itself has verified. */
export interface VerifiedGoogleIdentity {
  readonly email: string;
  readonly googleId: string;
  readonly name?: string;
  readonly avatarUrl?: string;
}

/**
 * Port: asks Google who an access token belongs to. Throws when Google does not confirm it (invalid or expired
 * token, issued to another application, unverified email) and `GoogleNotConfiguredError` when the server cannot ask.
 */
export interface IdentityVerifier {
  verify(accessToken: string): Promise<VerifiedGoogleIdentity>;
}

/** Port: turns an identity (an email, a Google id) into the irreversible value an account is stored under. */
export type IdentityHasher = (rawIdentity: string) => string;

/** What a session says about its holder besides who they are. */
export interface SessionClaims {
  readonly admin?: boolean;
  /** A demo session: it ends after an hour whatever the person does. */
  readonly guest?: boolean;
}
/** Port: signs the session a person carries after signing in. */
export type SessionTokenIssuer = (userId: string, claims?: SessionClaims) => string;

/** What the browser returns from the passkey prompt. Its structure is checked by the authenticator, not by the core. */
export type PasskeyCredential = Readonly<Record<string, unknown>>;

/** The question for a passkey sign-in: the options for the browser's prompt, and the id the answer must come back with. */
export interface PasskeySignInChallenge {
  readonly challengeId: string;
  readonly options: unknown;
}

/**
 * Port: passkey (WebAuthn) sign-in and registration. A passkey is saved only for an account that is already signed in,
 * and signs in without anyone typing an email: the account is found from the credential itself. Every refusal is a
 * `SignInRejectedError` with a code, never a message from the library.
 */
export interface PasskeyAuthenticator {
  signInChallenge(): Promise<PasskeySignInChallenge>;
  verifySignIn(challengeId: string, credential: PasskeyCredential): Promise<AuthUser>;
  /** The options for saving a passkey on `userId`'s account. */
  registrationOptions(userId: string): Promise<unknown>;
  register(userId: string, credential: PasskeyCredential): Promise<void>;
}

/** A passkey as saved: enough to check what it signs. */
export interface StoredPasskey {
  readonly credentialId: string;
  /** The public key, base64url. */
  readonly publicKey: string;
  readonly counter: number;
}

/** Port: where passkeys are kept. One per account. */
export interface PasskeyStore {
  /** The account a credential belongs to, with the passkey saved for it. */
  findByCredentialId(credentialId: string): Promise<{ readonly account: AuthUser; readonly passkey: StoredPasskey } | null>;
  save(userId: string, passkey: StoredPasskey): Promise<void>;
  updateCounter(userId: string, counter: number): Promise<void>;
}

/** Port: the demo accounts. Each guest has an account of their own, which is erased when they leave or after an hour. */
export interface GuestAccounts {
  /** A new, empty guest account that expires at `expiresAt`. */
  create(expiresAt: Date, defaults: NewUserDefaults): Promise<AuthUser>;
  /** True while the account exists and has not expired. */
  isLive(userId: string, now: Date): Promise<boolean>;
  countLive(now: Date): Promise<number>;
  /** Erases the account and everything it owns, if (and only if) it is a guest. Answers whether anything was erased. */
  erase(userId: string): Promise<boolean>;
  /** Erases every guest account that expired by `now`; answers how many. */
  eraseExpired(now: Date): Promise<number>;
}

/** Port: gives a new guest account the demo's profile and portfolio. */
export interface GuestSeeder {
  seed(userId: string): Promise<void>;
}

/** One instrument a person can look for when logging a transaction. */
export interface TickerMatch {
  readonly symbol: string;
  readonly name: string;
  readonly assetClass: string;
  readonly sector: string;
  readonly price?: number;
  readonly currency?: string;
}

/** Port: finds instruments by name or symbol. */
export interface TickerSearch {
  search(query: string): Promise<readonly TickerMatch[]>;
}

/** A transaction as persisted. Amounts are in `currency`; cash and money put in are replayed from these, never stored. */
export interface StoredTransaction {
  readonly id: string;
  readonly type: 'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL';
  readonly symbol: string;
  readonly name: string | null;
  readonly assetClass: string;
  readonly region: string;
  readonly sector: string;
  readonly quantity: number;
  readonly amount: number;
  readonly fee: number;
  readonly totalAmount: number;
  readonly currency: string;
  readonly notes: string | null;
  readonly date: Date;
  readonly paidWithCash: boolean;
  readonly createdAt: Date;
}

/** What is still held of one instrument. */
export interface StoredPosition {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly assetClass: string;
  readonly region: string;
  readonly sector: string;
  readonly quantity: number;
  readonly investedAmount: number;
  readonly createdAt: Date;
}

/** The profit (or loss) a sale locked in. */
export interface StoredRealizedGain {
  readonly id: string;
  readonly symbol: string;
  readonly assetClass: string;
  readonly region: string;
  readonly sector: string;
  readonly investedAmount: number;
  readonly returnedAmount: number;
  readonly realizedPnl: number;
  readonly realizedPnlPercent: number;
  readonly date: Date;
  readonly createdAt: Date;
}

/** Whose portfolio it is, and what it is reported in. */
export interface PortfolioOwner {
  readonly id: string;
  readonly country: string;
  readonly baseCurrency: string;
}

/**
 * Port: persistence of a person's portfolio. Every call is scoped to one user. This is the seam where the phase that encrypts
 * transactions, positions and gains plugs in: only the adapter changes.
 */
export interface PortfolioRepository {
  owner(userId: string): Promise<PortfolioOwner | null>;
  /** Oldest first. */
  transactions(userId: string): Promise<StoredTransaction[]>;
  positions(userId: string): Promise<StoredPosition[]>;
  /** Newest first. */
  realizedGains(userId: string): Promise<StoredRealizedGain[]>;
  findPosition(userId: string, symbol: string): Promise<StoredPosition | null>;
  /** Saves the transaction and everything it changes (position, realized gain) together, or nothing. */
  record(userId: string, plan: TransactionPlan): Promise<StoredTransaction>;
  /**
   * Corrects or removes one transaction of this person and, in the same step, rewrites the position and the realized gains of its
   * instrument from the ledger as it now stands, or nothing. Answers false (and changes nothing) when the person has no such transaction.
   */
  amend(userId: string, amendment: LedgerAmendment): Promise<boolean>;
  /** Everyone with at least one transaction: who the daily snapshot job reads. */
  usersWithTransactions(): Promise<string[]>;
}

/** One correction to the ledger, with the instrument it leaves behind (`null` for a deposit or withdrawal, which has none). */
export type LedgerAmendment =
  | {
      readonly kind: 'update';
      readonly id: string;
      readonly data: {
        readonly date: Date;
        readonly quantity: number;
        readonly amount: number;
        readonly fee: number;
        readonly totalAmount: number;
        readonly paidWithCash: boolean;
        readonly notes: string | null;
      };
      readonly instrument: RebuiltInstrument | null;
    }
  | { readonly kind: 'delete'; readonly id: string; readonly instrument: RebuiltInstrument | null };

/** Port: the daily readings of each portfolio. */
export interface SnapshotRepository {
  /** Every reading of the user, any order. */
  list(userId: string): Promise<PortfolioSnapshot[]>;
  /** Saves the reading of its day, replacing one already there. */
  save(userId: string, snapshot: PortfolioSnapshot): Promise<void>;
  /** Forgets the readings from `day` (inclusive, `YYYY-MM-DD`) onward: they were taken of a ledger that has since been corrected. */
  deleteFrom(userId: string, day: string): Promise<void>;
  /** Saves many readings at once (the demo's illustrative history), all or nothing; a day already there is left as it is. */
  saveMany(userId: string, snapshots: readonly PortfolioSnapshot[]): Promise<void>;
  has(userId: string, day: string): Promise<boolean>;
}

/** Port: how much prices rose in a country, which the real-return figures need. */
export interface InflationRates {
  /** Brings the stored rates of a country up to date. */
  sync(country: string): Promise<void>;
  /** The percentage prices rose in `country` between two dates. */
  between(country: string, from: Date, to: Date): Promise<number>;
}
