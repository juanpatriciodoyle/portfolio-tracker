import type { PrismaClient } from '@prisma/client';
import type { AuthUser, GuestAccounts } from '../application/ports';
import type { NewUserDefaults } from '../domain/newUser';
import { GUEST_DISPLAY_NAME } from '../domain/guestAccount';

/**
 * Demo accounts in Postgres. A guest is an ordinary user row (no identity hash, no email) flagged `isGuest`, so every
 * table that belongs to a user works for it unchanged, and one delete erases all of it (every relation cascades).
 */
export class PrismaGuestAccounts implements GuestAccounts {
  constructor(private readonly db: PrismaClient) {}

  async create(expiresAt: Date, defaults: NewUserDefaults): Promise<AuthUser> {
    const user = await this.db.user.create({ data: { ...defaults, name: GUEST_DISPLAY_NAME, isGuest: true, guestExpiresAt: expiresAt } });
    return { id: user.id, country: user.country, hasPasskey: false, isGuest: true };
  }

  async isLive(userId: string, now: Date): Promise<boolean> {
    return (await this.db.user.count({ where: { id: userId, isGuest: true, guestExpiresAt: { gt: now } } })) > 0;
  }

  countLive(now: Date): Promise<number> {
    return this.db.user.count({ where: { isGuest: true, guestExpiresAt: { gt: now } } });
  }

  async erase(userId: string): Promise<boolean> {
    // The flag is part of the condition: this can never erase a real account, whatever id it is given.
    const { count } = await this.db.user.deleteMany({ where: { id: userId, isGuest: true } });
    return count > 0;
  }

  async eraseExpired(now: Date): Promise<number> {
    const { count } = await this.db.user.deleteMany({ where: { isGuest: true, guestExpiresAt: { lte: now } } });
    return count;
  }
}
