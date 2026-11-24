import type { Express, Router } from 'express';
import { Router as createRouter } from 'express';
import type { PrismaClient } from '@prisma/client';
import { BilledCostReader } from '../application/billedCosts';
import { BillingRecordService } from '../application/billingRecordService';
import { LivingPhaseService } from '../application/livingPhaseService';
import { ProfileService } from '../application/profileService';
import { CapitalHorizonService } from '../application/capitalHorizonService';
import { SecondSalaryService } from '../application/secondSalaryService';
import { BenchmarkService } from '../application/benchmarkService';
import { BenchmarkRefresher, CountryStatisticsService } from '../application/countryStatisticsService';
import { DocumentExtractionService } from '../application/documentExtractionService';
import type { DemoProfileServices } from '../application/guestSeeder';
import { ConcurrencyGate, SlidingWindowRateLimiter } from '../application/limits';
import type { BillFingerprinter, BillingRecordRepository, FieldCipher, FxRateProvider, LivingPhaseRepository, PdfTextExtractor, PortfolioValueReader, ProfileRepository } from '../application/ports';
import { ENCRYPTION_NOT_CONFIGURED, type ApiErrorResponse, type CalendarDate } from '../contracts';
import { calendarDateOf } from '../domain/calendarDate';
import { log } from '../lib/logger';
import { AesGcmFieldCipher, loadFieldCipherKey } from '../infrastructure/aesGcmFieldCipher';
import { BcraOfficialRateSource } from '../infrastructure/fx/bcraOfficialRates';
import { FrankfurterFxRateProvider } from '../infrastructure/fx/frankfurterFxRates';
import { WorkerPdfTextExtractor } from '../infrastructure/pdf/workerPdfTextExtractor';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { LiveFxRateProvider } from '../infrastructure/fx/liveFxRateProvider';
import { ReferenceFxRateProvider } from '../infrastructure/fx/referenceFxRates';
import { EurostatStatisticsProvider } from '../infrastructure/benchmarks/eurostatStatistics';
import { IndecStatisticsProvider } from '../infrastructure/benchmarks/indecStatistics';
import { WorldBankPipStatisticsProvider } from '../infrastructure/benchmarks/worldBankPipStatistics';
import { WorldBankStatisticsProvider } from '../infrastructure/benchmarks/worldBankStatistics';
import { PnlPortfolioValueReader } from '../infrastructure/pnlPortfolioValueReader';
import { marketPrices } from '../infrastructure/market/marketPrices';
import { PrismaBillingRecordRepository } from '../infrastructure/prismaBillingRecordRepository';
import { PrismaCountryStatisticsRepository } from '../infrastructure/prismaCountryStatisticsRepository';
import { createPortfolioService } from '../infrastructure/prismaPortfolioDeps';
import { PrismaJobLock } from '../infrastructure/prismaJobLock';
import { PrismaLivingPhaseRepository } from '../infrastructure/prismaLivingPhaseRepository';
import { PrismaProfileRepository } from '../infrastructure/prismaProfileRepository';
import { noStore, requireUser } from './http';
import { createBenchmarksRouter } from './benchmarks';
import { createCapitalHorizonRouter } from './capitalHorizon';
import { createBillingRecordsRouter } from './billingRecords';
import { createDocumentsRouter } from './documents';
import { createLivingPhasesRouter } from './livingPhases';
import { createProfileRouter } from './profile';
import { createSecondSalaryRouter } from './secondSalary';

export interface ProfileFeatureDeps {
  readonly cipher: FieldCipher;
  readonly fingerprinter: BillFingerprinter;
  readonly livingPhaseRepository: LivingPhaseRepository;
  readonly profileRepository: ProfileRepository;
  readonly billingRecordRepository: BillingRecordRepository;
  /** Reads bill PDFs. Without it the document routes are not mounted. */
  readonly pdfTextExtractor?: PdfTextExtractor;
  /** Public country statistics for the benchmarks. Without it the benchmark route is not mounted. */
  readonly statistics?: CountryStatisticsService;
  /** What the portfolio is worth, for the second salary and the capital horizon. Without it those routes are not mounted. */
  readonly portfolio?: PortfolioValueReader;
  readonly documentLimits?: { readonly limit?: number; readonly windowMs?: number; readonly maxConcurrent?: number; readonly now?: () => number };
  readonly today?: () => CalendarDate;
  readonly newId?: () => string;
  readonly fx?: FxRateProvider;
}

/** The services that keep a person's living phases, bills and profile. Routes use them, and so does the demo guest's seed. */
export function createProfileServices(deps: ProfileFeatureDeps): DemoProfileServices {
  const phases = new LivingPhaseService({
    repository: deps.livingPhaseRepository,
    cipher: deps.cipher,
    newId: deps.newId,
    fx: deps.fx,
    billedCosts: new BilledCostReader(deps.billingRecordRepository, deps.cipher),
  });
  return {
    phases,
    profiles: new ProfileService({ repository: deps.profileRepository, cipher: deps.cipher }),
    bills: new BillingRecordService({ repository: deps.billingRecordRepository, phases, cipher: deps.cipher, fingerprinter: deps.fingerprinter, newId: deps.newId }),
  };
}

/** Wires services to routes. Pure composition: easy to run with in-memory repositories in tests. */
export function buildProfileFeature(deps: ProfileFeatureDeps): Router[] {
  const today = deps.today ?? (() => calendarDateOf(new Date()));
  const { phases, profiles, bills } = createProfileServices(deps);
  const limits = deps.documentLimits ?? {};
  const documents = deps.pdfTextExtractor
    ? [
        createDocumentsRouter({
          service: new DocumentExtractionService({
            extractor: deps.pdfTextExtractor,
            phases,
            limiter: new SlidingWindowRateLimiter({ limit: limits.limit ?? 10, windowMs: limits.windowMs ?? 60_000, now: limits.now ?? Date.now }),
            gate: new ConcurrencyGate(limits.maxConcurrent ?? 2),
          }),
          today,
        }),
      ]
    : [];
  const benchmarks = deps.statistics
    ? [createBenchmarksRouter({ service: new BenchmarkService({ phases, profiles, statistics: deps.statistics, fx: deps.fx }), today })]
    : [];
  const capitalHorizon = deps.portfolio ? [createCapitalHorizonRouter({ service: new CapitalHorizonService({ phases, profiles, portfolio: deps.portfolio }), today })] : [];
  const secondSalary = deps.portfolio ? [createSecondSalaryRouter({ service: new SecondSalaryService({ phases, profiles, portfolio: deps.portfolio }), today })] : [];
  return [
    ...documents,
    ...benchmarks,
    ...secondSalary,
    ...capitalHorizon,
    createLivingPhasesRouter({ service: phases, today }),
    createBillingRecordsRouter({ service: bills, today }),
    createProfileRouter({ service: profiles, today }),
  ];
}

/** What the routes answer while no encryption key is configured: nothing is stored, nothing is guessed. */
function encryptionUnavailableRouter(): Router {
  const router = createRouter();
  router.use(['/living-phases', '/billing-records', '/insights', '/profile', '/documents'], noStore, requireUser, (_req, res) => {
    res.status(503).json({
      error: 'Profile data cannot be stored until the server has a PROFILE_ENCRYPTION_KEY (see apps/api/.env.example).',
      code: ENCRYPTION_NOT_CONFIGURED,
    } satisfies ApiErrorResponse);
  });
  return router;
}

/**
 * Mounts the profile and living-phase routes on /api. Without an encryption key a production server
 * refuses to start; a development server keeps running and answers 503 on these routes only.
 */
export function mountProfileFeature(
  app: Express,
  { env, prisma }: { env: Readonly<Record<string, string | undefined>>; prisma: PrismaClient }
): { benchmarkRefresher: BenchmarkRefresher | null; profileServices: DemoProfileServices | null } {
  try {
    const key = loadFieldCipherKey(env);
    const cipher = new AesGcmFieldCipher(key);
    const statistics = new CountryStatisticsService({
      repository: new PrismaCountryStatisticsRepository(prisma),
      // Specific sources first, so the World Bank only fills in what they do not publish.
      providers: [new EurostatStatisticsProvider(), new IndecStatisticsProvider(), new WorldBankStatisticsProvider(), new WorldBankPipStatisticsProvider()],
      now: Date.now,
    });
    const deps: ProfileFeatureDeps = {
      cipher,
      fingerprinter: new HmacBillFingerprinter(key),
      pdfTextExtractor: new WorkerPdfTextExtractor(),
      statistics,
      portfolio: new PnlPortfolioValueReader(createPortfolioService(prisma, marketPrices)),
      livingPhaseRepository: new PrismaLivingPhaseRepository(prisma),
      profileRepository: new PrismaProfileRepository(prisma),
      billingRecordRepository: new PrismaBillingRecordRepository(prisma),
      fx: new LiveFxRateProvider({
        ecb: new FrankfurterFxRateProvider(),
        bcra: new BcraOfficialRateSource(),
        reference: new ReferenceFxRateProvider(),
      }),
    };
    app.use('/api', ...buildProfileFeature(deps));
    return {
      profileServices: createProfileServices(deps),
      benchmarkRefresher: new BenchmarkRefresher({
        statistics,
        lock: new PrismaJobLock(prisma),
        countriesInUse: async () => (await prisma.livingPhase.findMany({ distinct: ['countryCode'], select: { countryCode: true } })).map((row) => row.countryCode),
      }),
    };
  } catch (error) {
    if (env.NODE_ENV === 'production') throw error;
    log.warn('profile_encryption_unavailable', { reason: (error as Error).message });
    app.use('/api', encryptionUnavailableRouter());
    return { benchmarkRefresher: null, profileServices: null };
  }
}
