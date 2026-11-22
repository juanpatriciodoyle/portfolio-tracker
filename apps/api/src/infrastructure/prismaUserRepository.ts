import type { PrismaClient } from '@prisma/client';
import type { AuthUser, UserRepository } from '../application/ports';
import type { NewUserDefaults } from '../domain/newUser';

const asAuthUser = ({ id, country, passkeyCredentialId }: { id: string; country: string; passkeyCredentialId: string | null }): AuthUser => ({
  id,
  country,
  hasPasskey: passkeyCredentialId !== null,
});

/** Accounts in Postgres, found by the hash of an identity. Nothing that identifies a person is stored. */
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByIdentityHash(userHash: string): Promise<AuthUser | null> {
    const user = await this.db.user.findUnique({ where: { userHash } });
    return user && asAuthUser(user);
  }

  async create(userHash: string, defaults: NewUserDefaults): Promise<AuthUser> {
    const user = await this.db.user.create({ data: { userHash, ...defaults } });
    console.log(`🔒 Anonymous pseudonymous user account created in DB (Hash: ${userHash.slice(0, 10)}...)`);
    return asAuthUser(user);
  }

  async recordLogin(userId: string, at: Date): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { lastLoginAt: at } });
  }

  async identityHashOf(userId: string): Promise<string | null> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { userHash: true } });
    return user?.userHash ?? null;
  }
}
