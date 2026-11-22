import type { AuthUser, UserRepository } from '../../application/ports';
import type { NewUserDefaults } from '../../domain/newUser';

/** A fast stand-in for the user table, following the same contract as the Prisma repository. */
export class InMemoryUserRepository implements UserRepository {
  private readonly byHash = new Map<string, AuthUser>();
  /** What each created user was given, so tests can assert the defaults a new account starts with. */
  readonly createdWith: { userHash: string; defaults: NewUserDefaults }[] = [];

  async findByIdentityHash(userHash: string): Promise<AuthUser | null> {
    return this.byHash.get(userHash) ?? null;
  }

  async create(userHash: string, defaults: NewUserDefaults): Promise<AuthUser> {
    const user: AuthUser = { id: `user-${this.byHash.size + 1}`, country: defaults.country, hasPasskey: false };
    this.byHash.set(userHash, user);
    this.createdWith.push({ userHash, defaults });
    return user;
  }

  /** Arrange: an account that already registered a passkey. */
  async createWithPasskey(userHash: string, defaults: NewUserDefaults): Promise<AuthUser> {
    const created = await this.create(userHash, defaults);
    const user: AuthUser = { ...created, hasPasskey: true };
    this.byHash.set(userHash, user);
    return user;
  }

  get size(): number {
    return this.byHash.size;
  }
}
