import type { CalendarDate, CapitalMilestone, ProfileData } from '../contracts';
import { InvalidProfileError } from '../domain/errors';
import { PayloadVault } from './payloadVault';
import type { CipherContext, FieldCipher, ProfileRepository } from './ports';
import { storedProfileSchema, type StoredProfile } from './storedPayloads';

const profileContext = (userId: string): CipherContext => ({ table: 'UserProfile', rowId: userId, userId });

const emptyProfile = (): StoredProfile => ({
  fullName: null,
  birthYear: null,
  nationalities: [],
  taxResidence: null,
  householdAdults: 1,
  dependentChildren: 0,
  employmentStatus: null,
  capitalMilestones: [],
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
    const { capitalMilestones: _goals, ...profile } = await this.load(userId);
    return profile;
  }

  async getCapitalMilestones(userId: string): Promise<CapitalMilestone[]> {
    return (await this.load(userId)).capitalMilestones;
  }

  /** `asOf` is today's date, supplied by the caller so the rule below stays deterministic. */
  async saveProfile(userId: string, profile: ProfileData, asOf: CalendarDate): Promise<void> {
    if (profile.birthYear !== null && profile.birthYear > Number(asOf.slice(0, 4))) {
      throw new InvalidProfileError('The birth year cannot be in the future');
    }
    const { capitalMilestones } = await this.load(userId);
    await this.store(userId, { ...profile, capitalMilestones });
  }

  /** Replaces the list of goals; the rest of the profile stays as it is. */
  async saveCapitalMilestones(userId: string, capitalMilestones: readonly CapitalMilestone[]): Promise<void> {
    await this.store(userId, { ...(await this.load(userId)), capitalMilestones: [...capitalMilestones] });
  }

  private async load(userId: string): Promise<StoredProfile> {
    const stored = await this.repository.find(userId);
    return stored ? this.vault.open(storedProfileSchema, stored.payload, profileContext(userId)) : emptyProfile();
  }

  private async store(userId: string, profile: StoredProfile): Promise<void> {
    await this.repository.save(userId, this.vault.seal(profile, profileContext(userId)));
  }
}
