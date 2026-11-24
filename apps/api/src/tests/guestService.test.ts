import { GuestService } from '../application/guestService';
import { SignInRejectedError } from '../application/errors';
import type { GuestSeeder } from '../application/ports';
import { MAX_LIVE_GUESTS } from '../domain/guestAccount';
import { InMemoryGuestAccounts } from './support/inMemoryGuestAccounts';

function build({ seed = async () => undefined }: { seed?: GuestSeeder['seed'] } = {}) {
  let now = new Date('2026-11-23T10:00:00.000Z');
  const accounts = new InMemoryGuestAccounts();
  const seeded: string[] = [];
  const claimsSeen: unknown[] = [];
  const service = new GuestService({
    accounts,
    seeder: { seed: async (userId) => (seeded.push(userId), seed(userId)) },
    issueToken: (userId, claims) => (claimsSeen.push(claims), `token-for-${userId}`),
    now: () => now,
  });
  return { service, accounts, seeded, claimsSeen, advance: (ms: number) => void (now = new Date(now.getTime() + ms)) };
}

describe('GuestService.begin', () => {
  it('gives every visitor an account of their own, seeded, with a guest session', async () => {
    const { service, accounts, seeded, claimsSeen } = build();

    const first = await service.begin();
    const second = await service.begin();

    expect(first.user.id).not.toBe(second.user.id);
    expect(seeded).toEqual([first.user.id, second.user.id]);
    expect(accounts.size).toBe(2);
    expect(first.token).toBe(`token-for-${first.user.id}`);
    expect(claimsSeen).toEqual([{ guest: true }, { guest: true }]);
  });

  it('answers a guest who is called Joe, is never an administrator, and cannot hold a passkey', async () => {
    const { service } = build();

    const { user } = await service.begin();

    expect(user).toEqual({
      id: 'guest-1',
      email: 'demo@portfolio.local',
      name: 'Joe',
      country: 'Spain',
      isAdmin: false,
      hasPasskey: false,
      isGuest: true,
    });
  });

  it('gives the account the hour it lasts', async () => {
    const { service, accounts, advance } = build();
    await service.begin();

    advance(59 * 60 * 1000);
    expect(await accounts.countLive(new Date('2026-11-23T10:59:00.000Z'))).toBe(1);
    advance(60 * 1000);
    expect(await service.isLive('guest-1')).toBe(false);
  });

  it('erases the account again, and says the demo is unavailable, when the seed fails halfway', async () => {
    const { service, accounts } = build({
      seed: async () => {
        throw new Error('database went away');
      },
    });

    await expect(service.begin()).rejects.toMatchObject({ name: 'SignInRejectedError', code: 'DEMO_UNAVAILABLE' });
    expect(accounts.size).toBe(0);
  });

  it('turns visitors away, without creating anything, when too many guests are in the demo', async () => {
    const { service, accounts } = build();
    for (let guest = 0; guest < MAX_LIVE_GUESTS; guest += 1) await service.begin();

    await expect(service.begin()).rejects.toMatchObject({ code: 'DEMO_BUSY' });
    expect(accounts.size).toBe(MAX_LIVE_GUESTS);
  });

  it('lets a visitor in again once an hour has freed the places', async () => {
    const { service, advance } = build();
    for (let guest = 0; guest < MAX_LIVE_GUESTS; guest += 1) await service.begin();
    advance(60 * 60 * 1000);

    await expect(service.begin()).resolves.toMatchObject({ user: { isGuest: true } });
  });
});

describe('GuestService.end', () => {
  it('erases the guest’s account when they sign out', async () => {
    const { service, accounts } = build();
    const { user } = await service.begin();

    await service.end(user.id);

    expect(accounts.has(user.id)).toBe(false);
  });

  it('refuses to erase an account that is not a guest, and says so', async () => {
    const { service, accounts } = build();
    accounts.addRealAccount('user-real');

    const attempt = service.end('user-real');

    await expect(attempt).rejects.toBeInstanceOf(SignInRejectedError);
    await expect(attempt).rejects.toMatchObject({ code: 'NOT_A_GUEST' });
    expect(accounts.has('user-real')).toBe(true);
  });

  it('does not touch the other guests', async () => {
    const { service, accounts } = build();
    const first = await service.begin();
    const second = await service.begin();

    await service.end(first.user.id);

    expect(accounts.has(second.user.id)).toBe(true);
  });
});

describe('GuestService.sweep', () => {
  it('erases the guests whose hour is over, and only those', async () => {
    const { service, accounts, advance } = build();
    const old = await service.begin();
    advance(30 * 60 * 1000);
    const recent = await service.begin();
    advance(31 * 60 * 1000);

    const erased = await service.sweep();

    expect(erased).toBe(1);
    expect(accounts.has(old.user.id)).toBe(false);
    expect(accounts.has(recent.user.id)).toBe(true);
  });

  it('erases nothing when nobody has expired', async () => {
    const { service } = build();
    await service.begin();
    await expect(service.sweep()).resolves.toBe(0);
  });
});

describe('GuestService.isLive', () => {
  it('is true for a guest in their hour, false after it, after sign-out, and for anyone unknown', async () => {
    const { service, advance } = build();
    const { user } = await service.begin();
    expect(await service.isLive(user.id)).toBe(true);

    await service.end(user.id);
    expect(await service.isLive(user.id)).toBe(false);

    expect(await service.isLive('nobody')).toBe(false);

    const other = await service.begin();
    advance(60 * 60 * 1000);
    expect(await service.isLive(other.user.id)).toBe(false);
  });
});
