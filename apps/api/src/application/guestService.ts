import { GUEST_DISPLAY_EMAIL, GUEST_DISPLAY_NAME, MAX_LIVE_GUESTS, guestSessionEnd } from '../domain/guestAccount';
import { NEW_USER_DEFAULTS } from '../domain/newUser';
import { errorName, log } from '../lib/logger';
import type { SignIn } from './authService';
import { SignInRejectedError } from './errors';
import type { GuestAccounts, GuestSeeder, SessionTokenIssuer } from './ports';

export interface GuestServiceDeps {
  readonly accounts: GuestAccounts;
  readonly seeder: GuestSeeder;
  readonly issueToken: SessionTokenIssuer;
  readonly now: () => Date;
}

/**
 * The demo ("Try the demo"). Each visitor gets an account of their own, filled with the demo's profile and portfolio,
 * so nobody sees or changes what another visitor does. It is erased when the guest signs out and, whatever happens,
 * an hour after it began: that is how the demo resets.
 */
export class GuestService {
  private readonly accounts: GuestAccounts;
  private readonly seeder: GuestSeeder;
  private readonly issueToken: SessionTokenIssuer;
  private readonly now: () => Date;

  constructor({ accounts, seeder, issueToken, now }: GuestServiceDeps) {
    this.accounts = accounts;
    this.seeder = seeder;
    this.issueToken = issueToken;
    this.now = now;
  }

  async begin(): Promise<SignIn> {
    const startedAt = this.now();
    if ((await this.accounts.countLive(startedAt)) >= MAX_LIVE_GUESTS) throw new SignInRejectedError('DEMO_BUSY');

    const account = await this.accounts.create(guestSessionEnd(startedAt), NEW_USER_DEFAULTS);
    try {
      await this.seeder.seed(account.id);
    } catch (error) {
      log.error('guest_seed_failed', { error: errorName(error) });
      // Never leave a half-filled account behind. If this fails too, the hourly sweep erases it.
      await this.accounts.erase(account.id).catch(() => undefined);
      throw new SignInRejectedError('DEMO_UNAVAILABLE');
    }

    return {
      token: this.issueToken(account.id, { guest: true }),
      user: { id: account.id, email: GUEST_DISPLAY_EMAIL, name: GUEST_DISPLAY_NAME, country: account.country, isAdmin: false, hasPasskey: false, isGuest: true },
    };
  }

  /** The guest signs out: everything they made goes. Only a guest account can be erased this way. */
  async end(userId: string): Promise<void> {
    if (!(await this.accounts.erase(userId))) throw new SignInRejectedError('NOT_A_GUEST');
  }

  /** Erases the guests whose hour is over; answers how many. */
  sweep(): Promise<number> {
    return this.accounts.eraseExpired(this.now());
  }

  /** Whether this guest's account still exists and is inside its hour. */
  isLive(userId: string): Promise<boolean> {
    return this.accounts.isLive(userId, this.now());
  }
}
