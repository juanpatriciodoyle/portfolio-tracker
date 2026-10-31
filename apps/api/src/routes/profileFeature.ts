import type { Express, Router } from 'express';
import { Router as createRouter } from 'express';
import type { PrismaClient } from '@prisma/client';
import { BillingRecordService } from '../application/billingRecordService';
import { LivingPhaseService } from '../application/livingPhaseService';
import { ProfileService } from '../application/profileService';
import { DocumentExtractionService } from '../application/documentExtractionService';
import { ConcurrencyGate, SlidingWindowRateLimiter } from '../application/limits';
import type { BillFingerprinter, BillingRecordRepository, FieldCipher, FxRateProvider, LivingPhaseRepository, PdfTextExtractor, ProfileRepository } from '../application/ports';
import { ENCRYPTION_NOT_CONFIGURED, type ApiErrorResponse, type CalendarDate } from '../contracts';
import { calendarDateOf } from '../domain/calendarDate';
import { AesGcmFieldCipher, loadFieldCipherKey } from '../infrastructure/aesGcmFieldCipher';
import { BcraOfficialRateSource } from '../infrastructure/fx/bcraOfficialRates';
import { FrankfurterFxRateProvider } from '../infrastructure/fx/frankfurterFxRates';
import { WorkerPdfTextExtractor } from '../infrastructure/pdf/workerPdfTextExtractor';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { LiveFxRateProvider } from '../infrastructure/fx/liveFxRateProvider';
import { ReferenceFxRateProvider } from '../infrastructure/fx/referenceFxRates';
import { PrismaBillingRecordRepository } from '../infrastructure/prismaBillingRecordRepository';
import { PrismaLivingPhaseRepository } from '../infrastructure/prismaLivingPhaseRepository';
import { PrismaProfileRepository } from '../infrastructure/prismaProfileRepository';
import { noStore, requireUser } from './http';
import { createBillingRecordsRouter } from './billingRecords';
import { createDocumentsRouter } from './documents';
import { createLivingPhasesRouter } from './livingPhases';
import { createProfileRouter } from './profile';

export interface ProfileFeatureDeps {
  readonly cipher: FieldCipher;
  readonly fingerprinter: BillFingerprinter;
  readonly livingPhaseRepository: LivingPhaseRepository;
  readonly profileRepository: ProfileRepository;
  readonly billingRecordRepository: BillingRecordRepository;
  /** Reads bill PDFs. Without it the document routes are not mounted. */
  readonly pdfTextExtractor?: PdfTextExtractor;
  readonly documentLimits?: { readonly limit?: number; readonly windowMs?: number; readonly maxConcurrent?: number; readonly now?: () => number };
  readonly today?: () => CalendarDate;
  readonly newId?: () => string;
  readonly fx?: FxRateProvider;
}

/** Wires services to routes. Pure composition: easy to run with in-memory repositories in tests. */
export function buildProfileFeature(deps: ProfileFeatureDeps): Router[] {
  const today = deps.today ?? (() => calendarDateOf(new Date()));
  const phases = new LivingPhaseService({ repository: deps.livingPhaseRepository, cipher: deps.cipher, newId: deps.newId, fx: deps.fx });
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
  return [
    ...documents,
    createLivingPhasesRouter({ service: phases, today }),
    createBillingRecordsRouter({
      service: new BillingRecordService({ repository: deps.billingRecordRepository, phases, cipher: deps.cipher, fingerprinter: deps.fingerprinter, newId: deps.newId }),
      today,
    }),
    createProfileRouter({
      service: new ProfileService({ repository: deps.profileRepository, cipher: deps.cipher }),
      today,
    }),
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
): void {
  try {
    const key = loadFieldCipherKey(env);
    const cipher = new AesGcmFieldCipher(key);
    app.use(
      '/api',
      ...buildProfileFeature({
        cipher,
        fingerprinter: new HmacBillFingerprinter(key),
        pdfTextExtractor: new WorkerPdfTextExtractor(),
        livingPhaseRepository: new PrismaLivingPhaseRepository(prisma),
        profileRepository: new PrismaProfileRepository(prisma),
        billingRecordRepository: new PrismaBillingRecordRepository(prisma),
        fx: new LiveFxRateProvider({
          ecb: new FrankfurterFxRateProvider(),
          bcra: new BcraOfficialRateSource(),
          reference: new ReferenceFxRateProvider(),
        }),
      })
    );
  } catch (error) {
    if (env.NODE_ENV === 'production') throw error;
    console.warn(`⚠️  ${(error as Error).message}\n   Profile and living-phase routes answer 503 until it is set.`);
    app.use('/api', encryptionUnavailableRouter());
  }
}
