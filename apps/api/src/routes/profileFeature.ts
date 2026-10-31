import type { Express, Router } from 'express';
import { Router as createRouter } from 'express';
import type { PrismaClient } from '@prisma/client';
import { LivingPhaseService } from '../application/livingPhaseService';
import { ProfileService } from '../application/profileService';
import type { FieldCipher, LivingPhaseRepository, ProfileRepository } from '../application/ports';
import { ENCRYPTION_NOT_CONFIGURED, type ApiErrorResponse, type CalendarDate } from '../contracts';
import { calendarDateOf } from '../domain/calendarDate';
import { AesGcmFieldCipher, loadFieldCipherKey } from '../infrastructure/aesGcmFieldCipher';
import { PrismaLivingPhaseRepository } from '../infrastructure/prismaLivingPhaseRepository';
import { PrismaProfileRepository } from '../infrastructure/prismaProfileRepository';
import { noStore, requireUser } from './http';
import { createLivingPhasesRouter } from './livingPhases';
import { createProfileRouter } from './profile';

export interface ProfileFeatureDeps {
  readonly cipher: FieldCipher;
  readonly livingPhaseRepository: LivingPhaseRepository;
  readonly profileRepository: ProfileRepository;
  readonly today?: () => CalendarDate;
  readonly newId?: () => string;
}

/** Wires services to routes. Pure composition: easy to run with in-memory repositories in tests. */
export function buildProfileFeature(deps: ProfileFeatureDeps): Router[] {
  const today = deps.today ?? (() => calendarDateOf(new Date()));
  return [
    createLivingPhasesRouter({
      service: new LivingPhaseService({ repository: deps.livingPhaseRepository, cipher: deps.cipher, newId: deps.newId }),
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
  router.use(['/living-phases', '/profile'], noStore, requireUser, (_req, res) => {
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
    const cipher = new AesGcmFieldCipher(loadFieldCipherKey(env));
    app.use(
      '/api',
      ...buildProfileFeature({
        cipher,
        livingPhaseRepository: new PrismaLivingPhaseRepository(prisma),
        profileRepository: new PrismaProfileRepository(prisma),
      })
    );
  } catch (error) {
    if (env.NODE_ENV === 'production') throw error;
    console.warn(`⚠️  ${(error as Error).message}\n   Profile and living-phase routes answer 503 until it is set.`);
    app.use('/api', encryptionUnavailableRouter());
  }
}
