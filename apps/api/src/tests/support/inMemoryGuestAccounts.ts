import type { AuthUser, GuestAccounts } from '../../application/ports';
import type { NewUserDefaults } from '../../domain/newUser';

/** A fast stand-in for the guest accounts, following the same contract as the Prisma adapter. */
export class InMemoryGuestAccounts implements GuestAccounts {
  private readonly guests = new Map<string, { account: AuthUser; expiresAt: Date }>();
  /** Accounts that are not guests: they must never be erased through this port. */
  private readonly realAccounts = new Set<string>();
  private counter = 0;

  async create(expiresAt: Date, defaults: NewUserDefaults): Promise<AuthUser> {
    const account: AuthUser = { id: `guest-${++this.counter}`, country: defaults.country, hasPasskey: false, isGuest: true };
    this.guests.set(account.id, { account, expiresAt });
    return account;
  }

  async isLive(userId: string, now: Date): Promise<boolean> {
    const guest = this.guests.get(userId);
    return guest !== undefined && guest.expiresAt.getTime() > now.getTime();
  }

  async countLive(now: Date): Promise<number> {
    return [...this.guests.keys()].filter((id) => this.guests.get(id)!.expiresAt.getTime() > now.getTime()).length;
  }

  async erase(userId: string): Promise<boolean> {
    return this.guests.delete(userId);
  }

  async eraseExpired(now: Date): Promise<number> {
    let erased = 0;
    for (const [id, guest] of this.guests) {
      if (guest.expiresAt.getTime() <= now.getTime()) {
        this.guests.delete(id);
        erased += 1;
      }
    }
    return erased;
  }

  /** Arrange: an account that is not a guest. */
  addRealAccount(id: string): void {
    this.realAccounts.add(id);
  }

  has(userId: string): boolean {
    return this.guests.has(userId) || this.realAccounts.has(userId);
  }

  get size(): number {
    return this.guests.size;
  }
}
