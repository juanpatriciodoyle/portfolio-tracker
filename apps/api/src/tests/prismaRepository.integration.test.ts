import { PrismaClient } from '@prisma/client';
import { LivingPhaseService } from '../application/livingPhaseService';
import { ProfileService } from '../application/profileService';
import { createLivingPhaseRequest } from '../contracts';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { PrismaLivingPhaseRepository } from '../infrastructure/prismaLivingPhaseRepository';
import { PrismaProfileRepository } from '../infrastructure/prismaProfileRepository';
import { livingPhaseRepositoryContract } from './support/livingPhaseRepositoryContract';

/**
 * Runs against a real, disposable Postgres database. Not part of `npm test`:
 *   TEST_DATABASE_URL=postgresql://... npm run test:integration
 * (the schema must be applied first: DATABASE_URL=$TEST_DATABASE_URL npx prisma db push)
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  describe.skip('Prisma repositories (set TEST_DATABASE_URL to run)', () => {
    it('needs a disposable database', () => undefined);
  });
} else {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const createdUsers: string[] = [];

  const newUser = async () => {
    const user = await prisma.user.create({ data: { email: `slice1-${crypto.randomUUID()}@example.invalid` } });
    createdUsers.push(user.id);
    return user.id;
  };

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  });

  // The exact same behaviour the in-memory repository is tested for. The database keeps rows
  // between tests (the fake starts empty each time), so each test removes its users, which
  // cascades to their phases and costs.
  livingPhaseRepositoryContract('Prisma / Postgres', async () => {
    const userA = await newUser();
    const userB = await newUser();
    return {
      repository: new PrismaLivingPhaseRepository(prisma),
      userA,
      userB,
      teardown: async () => {
        await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
      },
    };
  });

  describe('end to end with a real database', () => {
    const cipher = new AesGcmFieldCipher(Buffer.alloc(32, 3));

    it('leaves nothing personal readable in the stored rows', async () => {
      const userId = await newUser();
      const phases = new LivingPhaseService({ repository: new PrismaLivingPhaseRepository(prisma), cipher });
      const profiles = new ProfileService({ repository: new PrismaProfileRepository(prisma), cipher });

      await phases.createPhase(
        userId,
        createLivingPhaseRequest.parse({
          name: 'Zanzibar Hideaway',
          city: 'Stone Town',
          address: '12 Mizingani Road',
          countryCode: 'TZ',
          tenure: 'RENT',
          startDate: '2024-01-01',
          endDate: null,
          currency: 'TZS',
          monthlyIncomeMinor: 987654321,
          notes: 'Beach cottage',
          fixedCosts: [{ category: 'RENT', cadence: 'MONTHLY', amountMinor: 123456789, label: 'Landlady Amina' }],
        })
      );
      await profiles.saveProfile(
        userId,
        {
          fullName: 'Quentin Zephyrine',
          birthYear: 1985,
          nationalities: ['TZ'],
          taxResidence: 'TZ',
          householdAdults: 2,
          dependentChildren: 1,
          employmentStatus: 'SELF_EMPLOYED',
        },
        '2026-10-31'
      );

      const rows = JSON.stringify({
        phases: await prisma.$queryRaw`SELECT * FROM "LivingPhase" WHERE "userId" = ${userId}`,
        costs: await prisma.$queryRaw`SELECT c.* FROM "FixedCostItem" c JOIN "LivingPhase" p ON p."id" = c."phaseId" WHERE p."userId" = ${userId}`,
        profile: await prisma.$queryRaw`SELECT * FROM "UserProfile" WHERE "userId" = ${userId}`,
      });

      for (const secret of ['Zanzibar', 'Stone Town', 'Mizingani', '987654321', '123456789', 'Beach cottage', 'Amina', 'Quentin', 'Zephyrine']) {
        expect(rows).not.toContain(secret);
      }
      expect((await phases.listPhases(userId))[0]).toMatchObject({ name: 'Zanzibar Hideaway', monthlyIncomeMinor: 987654321 });
      expect((await profiles.getProfile(userId)).fullName).toBe('Quentin Zephyrine');
    });

    it('deletes a person’s phases, costs and profile with the person', async () => {
      const userId = await newUser();
      const phases = new LivingPhaseService({ repository: new PrismaLivingPhaseRepository(prisma), cipher });
      const profiles = new ProfileService({ repository: new PrismaProfileRepository(prisma), cipher });
      await phases.createPhase(
        userId,
        createLivingPhaseRequest.parse({
          name: 'Home', city: 'Town', countryCode: 'ES', tenure: 'OWN', startDate: '2020-01-01', currency: 'EUR', monthlyIncomeMinor: 1,
          fixedCosts: [{ category: 'GAS', cadence: 'QUARTERLY', amountMinor: 3000 }],
        })
      );
      await profiles.saveProfile(userId, { fullName: 'Someone', birthYear: null, nationalities: [], taxResidence: null, householdAdults: 1, dependentChildren: 0, employmentStatus: null }, '2026-10-31');

      await prisma.user.delete({ where: { id: userId } });

      expect(await prisma.livingPhase.count({ where: { userId } })).toBe(0);
      expect(await prisma.fixedCostItem.count({ where: { phase: { userId } } })).toBe(0);
      expect(await prisma.userProfile.count({ where: { userId } })).toBe(0);
    });
  });
}
