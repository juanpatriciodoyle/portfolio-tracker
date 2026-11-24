import type { PrismaClient } from '@prisma/client';
import type { AuthUser, UserRepository } from '../application/ports';
import type { NewUserDefaults } from '../domain/newUser';
import { log } from '../lib/logger';

const asAuthUser = ({ id, country, passkeyCredentialId, isGuest }: { id: string; country: string; passkeyCredentialId: string | null; isGuest: boolean }): AuthUser => ({
  id,
  country,
  hasPasskey: passkeyCredentialId !== null,
  isGuest,
});

/** Accounts in Postgres, found by the hash of an identity. Nothing that identifies a person is stored. */
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByIdentityHash(userHash: string): Promise<AuthUser | null> {
    const user = await this.db.user.findUnique({ where: { userHash } });
    return user && asAuthUser(user);
  }

  async findById(userId: string): Promise<AuthUser | null> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    return user && asAuthUser(user);
  }

  async create(userHash: string, defaults: NewUserDefaults): Promise<AuthUser> {
    const user = await this.db.user.create({ data: { userHash, ...defaults } });
    log.info('account_created');
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
