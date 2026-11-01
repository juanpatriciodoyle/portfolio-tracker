import { salary } from './support/income';
import { PrismaClient } from '@prisma/client';
import { BillingRecordService } from '../application/billingRecordService';
import { LivingPhaseService } from '../application/livingPhaseService';
import { ProfileService } from '../application/profileService';
import { createLivingPhaseRequest } from '../contracts';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { PrismaCountryStatisticsRepository } from '../infrastructure/prismaCountryStatisticsRepository';
import { PrismaJobLock } from '../infrastructure/prismaJobLock';
import { PrismaBillingRecordRepository } from '../infrastructure/prismaBillingRecordRepository';
import { PrismaLivingPhaseRepository } from '../infrastructure/prismaLivingPhaseRepository';
import { PrismaProfileRepository } from '../infrastructure/prismaProfileRepository';
import { billingRecordRepositoryContract } from './support/billingRecordRepositoryContract';
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

  billingRecordRepositoryContract('Prisma / Postgres', async () => {
    const userA = await newUser();
    const userB = await newUser();
    return {
      repository: new PrismaBillingRecordRepository(prisma),
      phases: new PrismaLivingPhaseRepository(prisma),
      userA,
      userB,
      teardown: async () => {
        await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
      },
    };
  });

  describe('country statistics and the job lock', () => {
    const statistics = {
      countryCode: 'ZZ',
      incomeDistribution: { source: 'EUROSTAT' as const, period: '2025', currency: 'EUR', distribution: { period: 'YEAR' as const, basis: 'EQUIVALISED' as const, points: [{ percentile: 10, value: 909100 }] } },
      housingCostShare: { source: 'EUROSTAT' as const, period: '2025', percent: 16 },
      purchasing: null,
    };

    afterEach(async () => {
      await prisma.countryStatistics.deleteMany({ where: { countryCode: 'ZZ' } });
    });

    it('stores statistics, overwrites them, and treats a row of the wrong shape as missing', async () => {
      const repository = new PrismaCountryStatisticsRepository(prisma);
      expect(await repository.find('ZZ')).toBeNull();

      await repository.save({ statistics, fetchedAt: '2026-10-31T12:00:00.000Z' });
      expect(await repository.find('ZZ')).toEqual({ statistics, fetchedAt: '2026-10-31T12:00:00.000Z' });

      await repository.save({ statistics: { ...statistics, housingCostShare: null }, fetchedAt: '2026-12-01T00:00:00.000Z' });
      expect((await repository.find('ZZ'))?.statistics.housingCostShare).toBeNull();

      await prisma.countryStatistics.update({ where: { countryCode: 'ZZ' }, data: { payload: { nonsense: true } } });
      expect(await repository.find('ZZ')).toBeNull();
    });

    it('lets only one server run a job at a time, and frees the lock afterwards', async () => {
      const lock = new PrismaJobLock(prisma);
      let releaseFirst: () => void = () => undefined;
      const hold = new Promise<void>((resolve) => (releaseFirst = resolve));
      const started: string[] = [];

      const first = lock.runExclusive('integration-test-job', async () => {
        started.push('first');
        await hold;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const second = await lock.runExclusive('integration-test-job', async () => {
        started.push('second');
      });
      const other = await lock.runExclusive('another-job', async () => undefined);
      releaseFirst();

      expect(second).toBe('skipped');
      expect(other).toBe('ran');
      expect(await first).toBe('ran');
      expect(await lock.runExclusive('integration-test-job', async () => undefined)).toBe('ran');
      expect(started).toEqual(['first']);
    });
  });

  describe('end to end with a real database', () => {
    it('keeps a bill’s vendor, amount and notes unreadable in the table', async () => {
      const cipher = new AesGcmFieldCipher(Buffer.alloc(32, 3));
      const userId = await newUser();
      const phases = new LivingPhaseService({ repository: new PrismaLivingPhaseRepository(prisma), cipher });
      const bills = new BillingRecordService({ repository: new PrismaBillingRecordRepository(prisma), phases, cipher, fingerprinter: new HmacBillFingerprinter(Buffer.alloc(32, 3)) });
      const { id: phaseId } = await phases.createPhase(
        userId,
        createLivingPhaseRequest.parse({ name: 'Home', city: 'Town', countryCode: 'ES', tenure: 'RENT', startDate: '2020-01-01', currency: 'EUR', incomeStreams: salary(1) })
      );

      await bills.createRecord(userId, {
        phaseId,
        category: 'ELECTRICITY',
        cadence: 'BIMONTHLY',
        periodStart: '2026-07-15',
        periodEnd: '2026-09-14',
        amountMinor: 8765432,
        vendor: 'Compañía Eléctrica Zephyr',
        notes: 'Meter behind the boiler',
      });

      const rows = JSON.stringify(await prisma.$queryRaw`SELECT * FROM "BillingRecord" WHERE "userId" = ${userId}`);
      for (const secret of ['Zephyr', 'Compa', '8765432', 'boiler']) expect(rows).not.toContain(secret);
      expect((await bills.listRecords(userId)).records[0]).toMatchObject({ vendor: 'Compañía Eléctrica Zephyr', amountMinor: 8765432 });
    });

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
          incomeStreams: salary(987654321),
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
      expect((await phases.listPhases(userId))[0]).toMatchObject({ name: 'Zanzibar Hideaway', incomeStreams: salary(987654321) });
      expect((await profiles.getProfile(userId)).fullName).toBe('Quentin Zephyrine');
    });

    it('deletes a person’s phases, costs and profile with the person', async () => {
      const userId = await newUser();
      const phases = new LivingPhaseService({ repository: new PrismaLivingPhaseRepository(prisma), cipher });
      const profiles = new ProfileService({ repository: new PrismaProfileRepository(prisma), cipher });
      await phases.createPhase(
        userId,
        createLivingPhaseRequest.parse({
          name: 'Home', city: 'Town', countryCode: 'ES', tenure: 'OWN', startDate: '2020-01-01', currency: 'EUR', incomeStreams: salary(1),
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
