import { profileDataSchema, type CalendarDate, type ProfileData } from '../contracts';
import { InvalidProfileError } from '../domain/errors';
import { PayloadVault } from './payloadVault';
import type { CipherContext, FieldCipher, ProfileRepository } from './ports';

const profileContext = (userId: string): CipherContext => ({ table: 'UserProfile', rowId: userId, userId });

const emptyProfile = (): ProfileData => ({
  fullName: null,
  birthYear: null,
  nationalities: [],
  taxResidence: null,
  householdAdults: 1,
  dependentChildren: 0,
  employmentStatus: null,
});

export interface ProfileServiceDeps {
  readonly repository: ProfileRepository;
  readonly cipher: FieldCipher;
}

/** One profile per person, stored as a single sealed payload. */
export class ProfileService {
  private readonly repository: ProfileRepository;
  private readonly vault: PayloadVault;

  constructor({ repository, cipher }: ProfileServiceDeps) {
    this.repository = repository;
    this.vault = new PayloadVault(cipher);
  }

  async getProfile(userId: string): Promise<ProfileData> {
    const stored = await this.repository.find(userId);
    return stored ? this.vault.open(profileDataSchema, stored.payload, profileContext(userId)) : emptyProfile();
  }

  /** `asOf` is today's date, supplied by the caller so the rule below stays deterministic. */
  async saveProfile(userId: string, profile: ProfileData, asOf: CalendarDate): Promise<void> {
    if (profile.birthYear !== null && profile.birthYear > Number(asOf.slice(0, 4))) {
      throw new InvalidProfileError('The birth year cannot be in the future');
    }
    await this.repository.save(userId, this.vault.seal(profile, profileContext(userId)));
  }
}
