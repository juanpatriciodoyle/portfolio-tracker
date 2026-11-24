import { PrismaClient } from '@prisma/client';
import { DemoGuestSeeder } from '../application/guestSeeder';
import { GuestService } from '../application/guestService';
import { createProfileServices } from '../routes/profileFeature';
import { NEW_USER_DEFAULTS } from '../domain/newUser';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { PrismaBillingRecordRepository } from '../infrastructure/prismaBillingRecordRepository';
import { REFERENCE_EUR_RATES } from '../infrastructure/fx/referenceFxRates';
import { PrismaDemoPortfolio } from '../infrastructure/prismaDemoPortfolio';
import { PrismaPortfolioRepository } from '../infrastructure/prismaPortfolioRepository';
import { PrismaSnapshotRepository } from '../infrastructure/prismaSnapshotRepository';
import { PrismaGuestAccounts } from '../infrastructure/prismaGuestAccounts';
import { PrismaLivingPhaseRepository } from '../infrastructure/prismaLivingPhaseRepository';
import { PrismaPasskeyStore } from '../infrastructure/prismaPasskeyStore';
import { PrismaProfileRepository } from '../infrastructure/prismaProfileRepository';
import { PrismaUsageStatistics } from '../infrastructure/prismaUsageStatistics';
import { PrismaUserRepository } from '../infrastructure/prismaUserRepository';
import { generateToken } from '../lib/auth';

/**
 * Runs against a real, disposable Postgres database (see prismaRepository.integration.test.ts).
 *   TEST_DATABASE_URL=postgresql://... npm run test:integration
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  describe.skip('Guest accounts and passkeys in Postgres (set TEST_DATABASE_URL to run)', () => {
    it('needs a disposable database', () => undefined);
  });
} else {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const accounts = new PrismaGuestAccounts(prisma);
  const NOW = new Date('2026-11-23T10:00:00.000Z');
  const inAnHour = new Date(NOW.getTime() + 3_600_000);
  const created: string[] = [];

  const realAccount = async () => {
    const user = await prisma.user.create({ data: { userHash: `hash-${crypto.randomUUID()}`, ...NEW_USER_DEFAULTS } });
    created.push(user.id);
    return user.id;
  };

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.user.deleteMany({ where: { isGuest: true } });
    await prisma.$disconnect();
  });

  describe('guest accounts', () => {
    it('are accounts of their own, live for an hour, and counted as live', async () => {
      const before = await accounts.countLive(NOW);
      const guest = await accounts.create(inAnHour, NEW_USER_DEFAULTS);
      created.push(guest.id);

      expect(guest.isGuest).toBe(true);
      expect(await accounts.isLive(guest.id, NOW)).toBe(true);
      expect(await accounts.isLive(guest.id, inAnHour)).toBe(false);
      expect(await accounts.countLive(NOW)).toBe(before + 1);
    });

    it('erase only guests: a real account is never touched, whatever id is given', async () => {
      const real = await realAccount();

      expect(await accounts.erase(real)).toBe(false);

      expect(await prisma.user.count({ where: { id: real } })).toBe(1);
    });

    it('erase the account and everything it owns, in every table', async () => {
      const guest = await accounts.create(inAnHour, NEW_USER_DEFAULTS);
      await new PrismaDemoPortfolio(prisma).write(guest.id);
      expect(await prisma.transaction.count({ where: { userId: guest.id } })).toBeGreaterThan(10);

      expect(await accounts.erase(guest.id)).toBe(true);

      expect(await prisma.user.count({ where: { id: guest.id } })).toBe(0);
      expect(await prisma.transaction.count({ where: { userId: guest.id } })).toBe(0);
      expect(await prisma.position.count({ where: { userId: guest.id } })).toBe(0);
      expect(await prisma.realizedGain.count({ where: { userId: guest.id } })).toBe(0);
    });

    it('take their illustrative value history with them when they are erased, and the daily job never reads them', async () => {
      const guest = await accounts.create(inAnHour, NEW_USER_DEFAULTS);
      created.push(guest.id);
      const seeder = new DemoGuestSeeder({
        portfolio: new PrismaDemoPortfolio(prisma),
        history: { snapshots: new PrismaSnapshotRepository(prisma), prices: { pricesFor: async () => new Map() }, eurValue: REFERENCE_EUR_RATES, priceTimeoutMs: 100 },
        profile: null,
        today: () => '2026-11-23',
      });

      const started = Date.now();
      await seeder.seed(guest.id);
      const took = Date.now() - started;
      console.info(`demo portfolio + history seeded in ${took} ms`);

      const stored = await new PrismaSnapshotRepository(prisma).list(guest.id);
      expect(stored.length).toBeGreaterThan(300);
      expect(stored[0].day).toBe('2020-01-05');
      expect(stored[stored.length - 1].day).toBe('2026-11-22');
      expect(await new PrismaPortfolioRepository(prisma).usersWithTransactions()).not.toContain(guest.id);

      expect(await accounts.erase(guest.id)).toBe(true);
      expect(await prisma.portfolioSnapshot.count({ where: { userId: guest.id } })).toBe(0);
    });

    it('are swept once their hour is over, and not before', async () => {
      const expired = await accounts.create(new Date(NOW.getTime() - 1000), NEW_USER_DEFAULTS);
      const current = await accounts.create(inAnHour, NEW_USER_DEFAULTS);
      const real = await realAccount();

      const erased = await accounts.eraseExpired(NOW);

      expect(erased).toBeGreaterThanOrEqual(1);
      expect(await prisma.user.count({ where: { id: expired.id } })).toBe(0);
      expect(await prisma.user.count({ where: { id: current.id } })).toBe(1);
      expect(await prisma.user.count({ where: { id: real } })).toBe(1);
    });

    it('are not customers in the usage figures', async () => {
      const statistics = new PrismaUsageStatistics(prisma);
      const before = await statistics.countCustomers();
      const guest = await accounts.create(inAnHour, NEW_USER_DEFAULTS);
      created.push(guest.id);
      await prisma.user.update({ where: { id: guest.id }, data: { lastLoginAt: NOW } });

      expect(await statistics.countCustomers()).toBe(before);
      await realAccount();
      expect(await statistics.countCustomers()).toBe(before + 1);
    });
  });

  describe('a whole demo visit, against the real tables', () => {
    it('seeds the portfolio and the sealed profile for one guest, and erases it all when they leave', async () => {
      const key = Buffer.alloc(32, 3);
      const cipher = new AesGcmFieldCipher(key);
      const profile = createProfileServices({
        cipher,
        fingerprinter: new HmacBillFingerprinter(key),
        livingPhaseRepository: new PrismaLivingPhaseRepository(prisma),
        profileRepository: new PrismaProfileRepository(prisma),
        billingRecordRepository: new PrismaBillingRecordRepository(prisma),
      });
      const guests = new GuestService({
        accounts,
        seeder: new DemoGuestSeeder({ portfolio: new PrismaDemoPortfolio(prisma), profile, today: () => '2026-11-23' }),
        issueToken: generateToken,
        now: () => NOW,
      });

      const { user } = await guests.begin();

      expect(await prisma.transaction.count({ where: { userId: user.id } })).toBeGreaterThan(10);
      expect(await prisma.livingPhase.count({ where: { userId: user.id } })).toBe(2);
      expect(await prisma.billingRecord.count({ where: { userId: user.id } })).toBeGreaterThanOrEqual(4);
      expect(await prisma.userProfile.count({ where: { userId: user.id } })).toBe(1);
      // sealed: the readable words are nowhere in the stored profile
      expect((await prisma.userProfile.findUniqueOrThrow({ where: { userId: user.id } })).payload).not.toContain('Joe Demo');

      await guests.end(user.id);

      expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
      expect(await prisma.livingPhase.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.billingRecord.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.userProfile.count({ where: { userId: user.id } })).toBe(0);
    });
  });

  describe('accounts and passkeys', () => {
    it('finds an account by id, and says whether it is a guest or has a passkey', async () => {
      const users = new PrismaUserRepository(prisma);
      const real = await realAccount();

      expect(await users.findById(real)).toEqual({ id: real, country: 'Spain', hasPasskey: false, isGuest: false });
      expect(await users.findById('nobody')).toBeNull();
    });

    it('keeps the passkey in the account’s row, finds the account from the credential, and moves the counter', async () => {
      const store = new PrismaPasskeyStore(prisma);
      const real = await realAccount();
      const credentialId = `cred-${crypto.randomUUID()}`;

      expect(await store.findByCredentialId(credentialId)).toBeNull();
      await store.save(real, { credentialId, publicKey: 'cHVibGlj', counter: 0 });
      expect(await store.findByCredentialId(credentialId)).toEqual({
        account: { id: real, country: 'Spain', hasPasskey: true, isGuest: false },
        passkey: { credentialId, publicKey: 'cHVibGlj', counter: 0 },
      });

      await store.updateCounter(real, 7);
      expect((await store.findByCredentialId(credentialId))?.passkey.counter).toBe(7);
    });
  });
}
