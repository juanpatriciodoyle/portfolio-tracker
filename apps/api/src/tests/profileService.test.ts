import { ProfileService } from '../application/profileService';
import type { ProfileData } from '../contracts';
import { InvalidProfileError } from '../domain/errors';
import { AesGcmFieldCipher, FieldCipherError } from '../infrastructure/aesGcmFieldCipher';
import { InMemoryProfileRepository } from './support/inMemoryRepositories';

const USER = 'user-1';
const OTHER_USER = 'user-2';
const TODAY = '2026-10-31';

const profile: ProfileData = {
  fullName: 'Juan Patricio Doyle',
  birthYear: 1990,
  nationalities: ['AR', 'ES'],
  taxResidence: 'ES',
  householdAdults: 1,
  dependentChildren: 0,
  employmentStatus: 'EMPLOYEE',
};

function build() {
  const repository = new InMemoryProfileRepository();
  const service = new ProfileService({ repository, cipher: new AesGcmFieldCipher(Buffer.alloc(32, 5)) });
  return { service, repository };
}

describe('ProfileService', () => {
  it('shows an empty profile until something is saved', async () => {
    const { service } = build();

    expect(await service.getProfile(USER)).toEqual({
      fullName: null,
      birthYear: null,
      nationalities: [],
      taxResidence: null,
      householdAdults: 1,
      dependentChildren: 0,
      employmentStatus: null,
    });
  });

  it('saves and reads back the whole profile', async () => {
    const { service } = build();

    await service.saveProfile(USER, profile, TODAY);

    expect(await service.getProfile(USER)).toEqual(profile);
  });

  it('replaces the previous profile on a second save', async () => {
    const { service } = build();
    await service.saveProfile(USER, profile, TODAY);

    await service.saveProfile(USER, { ...profile, dependentChildren: 2, employmentStatus: 'SELF_EMPLOYED' }, TODAY);

    expect(await service.getProfile(USER)).toMatchObject({ dependentChildren: 2, employmentStatus: 'SELF_EMPLOYED' });
  });

  it('stores nothing about the person in readable form', async () => {
    const { service, repository } = build();
    await service.saveProfile(USER, profile, TODAY);

    const stored = JSON.stringify(repository.dump());

    for (const secret of ['Juan', 'Doyle', 'Patricio', 'EMPLOYEE', 'nationalities']) {
      expect(stored).not.toContain(secret);
    }
  });

  it('keeps every person’s profile separate', async () => {
    const { service } = build();
    await service.saveProfile(USER, profile, TODAY);

    expect((await service.getProfile(OTHER_USER)).fullName).toBeNull();
  });

  it('rejects a birth year in the future, but accepts this year', async () => {
    const { service } = build();

    await expect(service.saveProfile(USER, { ...profile, birthYear: 2027 }, TODAY)).rejects.toBeInstanceOf(InvalidProfileError);
    await expect(service.saveProfile(USER, { ...profile, birthYear: 2026 }, TODAY)).resolves.toBeUndefined();
  });

  it('refuses to read a profile whose stored data was tampered with', async () => {
    const { service, repository } = build();
    await service.saveProfile(USER, profile, TODAY);
    await repository.save(USER, 'v1:AAAA:AAAA:AAAA');

    await expect(service.getProfile(USER)).rejects.toThrow(FieldCipherError);
  });
});
