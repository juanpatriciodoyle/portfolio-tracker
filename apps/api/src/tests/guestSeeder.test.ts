import { DemoGuestSeeder, type DemoProfileServices } from '../application/guestSeeder';
import { BillingRecordService } from '../application/billingRecordService';
import { LivingPhaseService } from '../application/livingPhaseService';
import { ProfileService } from '../application/profileService';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { InMemoryBillingRecordRepository, InMemoryLivingPhaseRepository, InMemoryProfileRepository } from './support/inMemoryRepositories';

const TODAY = '2026-11-23';

function build() {
  const phaseRepository = new InMemoryLivingPhaseRepository();
  const profileRepository = new InMemoryProfileRepository();
  const billRepository = new InMemoryBillingRecordRepository(phaseRepository);
  const cipher = new AesGcmFieldCipher(Buffer.alloc(32, 7));
  const phases = new LivingPhaseService({ repository: phaseRepository, cipher });
  const profiles = new ProfileService({ repository: profileRepository, cipher });
  const bills = new BillingRecordService({ repository: billRepository, phases, cipher, fingerprinter: new HmacBillFingerprinter(Buffer.alloc(32, 9)) });
  const services: DemoProfileServices = { phases, profiles, bills };
  const portfolioFor: string[] = [];
  const seeder = new DemoGuestSeeder({ portfolio: { write: async (userId) => void portfolioFor.push(userId) }, profile: services, today: () => TODAY });
  return { seeder, services, portfolioFor, phaseRepository, profileRepository, billRepository };
}

describe('seeding a demo guest', () => {
  it('gives the guest the demo portfolio', async () => {
    const { seeder, portfolioFor } = build();
    await seeder.seed('guest-1');
    expect(portfolioFor).toEqual(['guest-1']);
  });

  it('gives the guest the whole demo profile, through the same services real accounts use', async () => {
    const { seeder, services } = build();

    await seeder.seed('guest-1');

    const phases = await services.phases.listPhases('guest-1');
    expect(phases.map(({ city }) => city)).toEqual(['Valencia', 'Madrid']);
    const madrid = phases.find(({ city }) => city === 'Madrid')!;
    expect(madrid.endDate).toBeNull();
    expect(madrid.incomeStreams).toHaveLength(2);
    expect(madrid.fixedCosts.map(({ category }) => category)).toEqual(expect.arrayContaining(['RENT', 'INTERNET']));
    const { records } = await services.bills.listRecords('guest-1', { phaseId: madrid.id });
    expect(records.length).toBeGreaterThanOrEqual(4);
    expect(await services.profiles.getProfile('guest-1')).toMatchObject({ fullName: 'Joe Demo', taxResidence: 'ES' });
    expect(await services.profiles.getCapitalMilestones('guest-1')).toHaveLength(2);
    expect(await services.profiles.getSecondSalaryTarget('guest-1')).toBeGreaterThan(0);
  });

  it('stores it sealed, like any real person’s data: nothing readable sits in the rows', async () => {
    const { seeder, phaseRepository, profileRepository, billRepository } = build();

    await seeder.seed('guest-1');

    const stored = JSON.stringify([phaseRepository.dump(), profileRepository.dump(), billRepository.dump()]);
    for (const readable of ['Madrid', 'Joe Demo', 'Iberdrola', 'Product designer', 'Flat deposit']) {
      expect(stored).not.toContain(readable);
    }
  });

  it('keeps every guest’s data their own: seeding a second guest leaves the first untouched', async () => {
    const { seeder, services } = build();
    await seeder.seed('guest-1');
    await seeder.seed('guest-2');

    expect(await services.phases.listPhases('guest-1')).toHaveLength(2);
    expect(await services.phases.listPhases('guest-2')).toHaveLength(2);
    const [first] = await services.phases.listPhases('guest-1');
    await services.phases.deletePhase('guest-1', first.id);
    expect(await services.phases.listPhases('guest-2')).toHaveLength(2);
  });

  it('still gives the portfolio when the server has no encryption key, and so no profile can be stored', async () => {
    const portfolioFor: string[] = [];
    const seeder = new DemoGuestSeeder({ portfolio: { write: async (userId) => void portfolioFor.push(userId) }, profile: null, today: () => TODAY });

    await expect(seeder.seed('guest-1')).resolves.toBeUndefined();
    expect(portfolioFor).toEqual(['guest-1']);
  });
});
