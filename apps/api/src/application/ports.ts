import type { CalendarDate, CostCadence, FixedCostCategory, HousingTenure } from '../contracts/vocabulary';

/** Where a stored value lives. Bound into every ciphertext so a value cannot be moved to another row or person. */
export interface CipherContext {
  readonly table: string;
  readonly rowId: string;
  readonly userId: string;
}

/** Port: encrypts and decrypts sensitive fields. The core never knows which algorithm or key is behind it. */
export interface FieldCipher {
  encrypt(plaintext: string, context: CipherContext): string;
  /** Throws if the value was tampered with, belongs to another context, or was made with another key. */
  decrypt(ciphertext: string, context: CipherContext): string;
}

/** A fixed cost as persisted: category and cadence stay readable, everything personal is sealed in `payload`. */
export interface StoredFixedCost {
  readonly id: string;
  readonly category: FixedCostCategory;
  readonly cadence: CostCadence;
  readonly payload: string;
}

/** A living phase as persisted: dates, currency, country and tenure stay readable so they can be ordered and joined. */
export interface StoredLivingPhase {
  readonly id: string;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate | null;
  readonly currency: string;
  readonly countryCode: string;
  readonly tenure: HousingTenure;
  readonly payload: string;
  readonly fixedCosts: readonly StoredFixedCost[];
}

/** Fields left out are unchanged; `endDate: null` clears the end date. */
export type StoredPhaseChange = Partial<Omit<StoredLivingPhase, 'id' | 'fixedCosts'>>;
export type StoredCostChange = Partial<Omit<StoredFixedCost, 'id'>>;

/** Port: persistence of living phases. Every call is scoped to one user; foreign rows simply do not exist. */
export interface LivingPhaseRepository {
  /** Oldest phase first. */
  list(userId: string): Promise<StoredLivingPhase[]>;
  find(userId: string, phaseId: string): Promise<StoredLivingPhase | null>;
  /** Saves every phase or none of them. */
  createMany(userId: string, phases: readonly StoredLivingPhase[]): Promise<void>;
  /** The mutations below answer false when the user has no such phase (or cost). */
  update(userId: string, phaseId: string, change: StoredPhaseChange): Promise<boolean>;
  delete(userId: string, phaseId: string): Promise<boolean>;
  addFixedCost(userId: string, phaseId: string, cost: StoredFixedCost): Promise<boolean>;
  updateFixedCost(userId: string, phaseId: string, costId: string, change: StoredCostChange): Promise<boolean>;
  deleteFixedCost(userId: string, phaseId: string, costId: string): Promise<boolean>;
}

export interface StoredProfile {
  readonly payload: string;
}

/** Port: persistence of the one profile each user has. */
export interface ProfileRepository {
  find(userId: string): Promise<StoredProfile | null>;
  save(userId: string, payload: string): Promise<void>;
}
