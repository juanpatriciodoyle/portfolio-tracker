import { AdminIdentities } from '../application/adminIdentities';
import { AuthService, type AuthServiceDeps } from '../application/authService';
import { GoogleNotConfiguredError, ResourceNotFoundError, SignInRejectedError } from '../application/errors';
import type { AuthUser, PasskeyAuthenticator } from '../application/ports';
import { NEW_USER_DEFAULTS } from '../domain/newUser';
import { InMemoryUserRepository } from './support/inMemoryUsers';

const SIGNED_IN_AT = new Date('2026-11-22T10:30:00.000Z');
const hash = (raw: string) => `hash:${raw}`;

/** A passkey authenticator that records what it was asked, and answers the account the test arranged. */
function fakePasskeys(result: () => Promise<AuthUser>) {
  const calls: string[] = [];
  const authenticator: PasskeyAuthenticator = {
    signInChallenge: async () => {
      calls.push('signInChallenge');
      return { challengeId: 'challenge-1', options: { challenge: 'abc' } };
    },
    verifySignIn: async (challengeId) => {
      calls.push(`verifySignIn:${challengeId}`);
      return result();
    },
    registrationOptions: async (userId) => {
      calls.push(`registrationOptions:${userId}`);
      return { challenge: 'reg' };
    },
    register: async (userId) => {
      calls.push(`register:${userId}`);
    },
  };
  return { authenticator, calls };
}

function build(overrides: Partial<AuthServiceDeps> = {}, passkeyResult: () => Promise<AuthUser> = async () => ({ id: 'user-1', country: 'Spain', hasPasskey: true, isGuest: false })) {
  const users = new InMemoryUserRepository();
  const verified: string[] = [];
  const claimsSeen: unknown[] = [];
  const { authenticator, calls } = fakePasskeys(passkeyResult);

  const deps: AuthServiceDeps = {
    users,
    googleIdentities: {
      verify: async (accessToken) => {
        verified.push(accessToken);
        return { email: 'verified@example.com', name: 'Verified Person', googleId: 'g-verified', avatarUrl: 'https://img/v.png' };
      },
    },
    passkeys: authenticator,
    hashIdentity: hash,
    issueToken: (userId, claims) => (claimsSeen.push(claims), `token-for-${userId}`),
    admins: new AdminIdentities([], hash),
    allowRegistration: true,
    now: () => SIGNED_IN_AT,
    ...overrides,
  };
  return { service: new AuthService(deps), users, verified, passkeyCalls: calls, claimsSeen };
}

describe('AuthService.signInWithGoogle', () => {
  it('creates a pseudonymous account for the email Google confirms, with the starting defaults, and returns a session', async () => {
    const { service, users, verified } = build();

    const signedIn = await service.signInWithGoogle('access-token');

    expect(verified).toEqual(['access-token']);
    expect(signedIn).toEqual({
      token: 'token-for-user-1',
      user: {
        id: 'user-1',
        email: 'verified@example.com',
        name: 'Verified Person',
        avatarUrl: 'https://img/v.png',
        country: 'Spain',
        isAdmin: false,
        hasPasskey: false,
        isGuest: false,
      },
    });
    expect(users.createdWith).toEqual([{ userHash: 'hash:verified@example.com', defaults: { country: 'Spain', baseCurrency: 'EUR', annualInflationRate: 2.8 } }]);
  });

  it('never stores the email: the account is found by the hash of it', async () => {
    const { service, users } = build();
    await service.signInWithGoogle('access-token');
    expect(JSON.stringify(users.createdWith)).not.toContain('"verified@example.com"');
  });

  it('finds the same account on the next sign-in instead of creating another', async () => {
    const { service, users } = build();

    const first = await service.signInWithGoogle('access-token');
    const second = await service.signInWithGoogle('access-token');

    expect(second.user.id).toBe(first.user.id);
    expect(users.size).toBe(1);
  });

  it('tells the web app when the account already has a passkey', async () => {
    const { service, users } = build();
    await users.createWithPasskey('hash:verified@example.com', NEW_USER_DEFAULTS);

    const signedIn = await service.signInWithGoogle('access-token');

    expect(signedIn.user.hasPasskey).toBe(true);
  });

  it('fills in a neutral name when Google shares none', async () => {
    const { service } = build({ googleIdentities: { verify: async () => ({ email: 'ana@example.com', googleId: 'g-1' }) } });

    const signedIn = await service.signInWithGoogle('access-token');

    expect(signedIn.user).toMatchObject({ email: 'ana@example.com', name: 'Privacy User' });
  });

  it('refuses a token Google does not confirm, and creates nothing', async () => {
    const { service, users } = build({
      googleIdentities: {
        verify: async () => {
          throw new Error('Invalid token signature');
        },
      },
    });

    const attempt = service.signInWithGoogle('forged');

    await expect(attempt).rejects.toBeInstanceOf(SignInRejectedError);
    await expect(attempt).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_UNVERIFIED', message: 'Google could not confirm your sign-in. Try signing in again.' });
    expect(users.size).toBe(0);
  });

  it('says plainly that Google sign-in is not set up when the server has no Google client, and creates nothing', async () => {
    const { service, users } = build({
      googleIdentities: {
        verify: async () => {
          throw new GoogleNotConfiguredError();
        },
      },
    });

    await expect(service.signInWithGoogle('access-token')).rejects.toMatchObject({ code: 'GOOGLE_NOT_CONFIGURED' });
    expect(users.size).toBe(0);
  });
});

describe('AuthService: signing in with a passkey', () => {
  it('hands the authenticator’s question back unchanged', async () => {
    const { service } = build();
    await expect(service.passkeySignInChallenge()).resolves.toEqual({ challengeId: 'challenge-1', options: { challenge: 'abc' } });
  });

  it('signs in whoever owns the passkey, with no email, and says the account has one', async () => {
    const { service, users, passkeyCalls } = build();
    const account = await users.createWithPasskey('hash:ana@example.com', NEW_USER_DEFAULTS);
    const credential = { id: 'cred-1', type: 'public-key' };
    const withAccount = build({ users }, async () => account);

    const signedIn = await withAccount.service.signInWithPasskey('challenge-1', credential);

    expect(signedIn).toEqual({
      token: `token-for-${account.id}`,
      user: { id: account.id, name: 'Investor', country: 'Spain', isAdmin: false, hasPasskey: true, isGuest: false },
    });
    expect(signedIn.user).not.toHaveProperty('email');
    expect(passkeyCalls).toEqual([]);
    expect(withAccount.passkeyCalls).toEqual(['verifySignIn:challenge-1']);
  });

  it('records the sign-in, and never makes it an administrator session', async () => {
    const users = new InMemoryUserRepository();
    const account = await users.createWithPasskey('hash:ana@example.com', NEW_USER_DEFAULTS);
    const { service, claimsSeen } = build({ users, admins: new AdminIdentities(['boss@example.test'], hash) }, async () => account);

    await service.signInWithPasskey('challenge-1', { id: 'x' });

    expect(users.lastLoginOf(account.id)).toEqual(SIGNED_IN_AT);
    expect(claimsSeen).toEqual([{ admin: false }]);
  });

  it('lets the reason the authenticator refused reach the caller, and records nothing', async () => {
    const users = new InMemoryUserRepository();
    const { service } = build({ users }, async () => {
      throw new SignInRejectedError('PASSKEY_CHALLENGE_EXPIRED');
    });

    await expect(service.signInWithPasskey('old', { id: 'x' })).rejects.toMatchObject({ code: 'PASSKEY_CHALLENGE_EXPIRED' });
    expect(users.size).toBe(0);
  });

  it('refuses a passkey that belongs to the administrator’s identity, whatever it proves', async () => {
    const users = new InMemoryUserRepository();
    const account = await users.createWithPasskey('hash:boss@example.test', NEW_USER_DEFAULTS);
    const { service, claimsSeen } = build({ users, admins: new AdminIdentities(['boss@example.test'], hash) }, async () => account);

    await expect(service.signInWithPasskey('challenge-1', { id: 'x' })).rejects.toMatchObject({ code: 'PASSKEY_NOT_FOR_ADMIN' });
    expect(claimsSeen).toEqual([]);
    expect(users.lastLoginOf(account.id)).toBeNull();
  });
});

describe('AuthService: adding a passkey to the signed-in account', () => {
  const admins = new AdminIdentities(['boss@example.test'], hash);

  it('starts and finishes the registration for an ordinary account that has no passkey yet', async () => {
    const { service, users, passkeyCalls } = build();
    const account = await users.create('hash:ana@example.com', NEW_USER_DEFAULTS);
    const credential = { id: 'new-cred' };

    await expect(service.passkeyRegistrationOptions(account.id)).resolves.toEqual({ challenge: 'reg' });
    await service.addPasskey(account.id, credential);

    expect(passkeyCalls).toEqual([`registrationOptions:${account.id}`, `register:${account.id}`]);
  });

  it('refuses an account that does not exist, before the authenticator is asked anything', async () => {
    const { service, passkeyCalls } = build();

    await expect(service.passkeyRegistrationOptions('ghost')).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.addPasskey('ghost', { id: 'x' })).rejects.toBeInstanceOf(ResourceNotFoundError);
    expect(passkeyCalls).toEqual([]);
  });

  it('refuses a demo guest: a passkey would outlive the account it belongs to', async () => {
    const { service, users, passkeyCalls } = build();
    users.addGuest('guest-1');

    await expect(service.passkeyRegistrationOptions('guest-1')).rejects.toMatchObject({ code: 'PASSKEY_NOT_FOR_GUEST' });
    await expect(service.addPasskey('guest-1', { id: 'x' })).rejects.toMatchObject({ code: 'PASSKEY_NOT_FOR_GUEST' });
    expect(passkeyCalls).toEqual([]);
  });

  it('refuses the administrator’s identity, so a passkey can never open that account', async () => {
    const { service, users, passkeyCalls } = build({ admins });
    const boss = await users.create('hash:boss@example.test', NEW_USER_DEFAULTS);

    await expect(service.passkeyRegistrationOptions(boss.id)).rejects.toMatchObject({ code: 'PASSKEY_NOT_FOR_ADMIN' });
    await expect(service.addPasskey(boss.id, { id: 'x' })).rejects.toMatchObject({ code: 'PASSKEY_NOT_FOR_ADMIN' });
    expect(passkeyCalls).toEqual([]);
  });

  it('refuses an account that already has one', async () => {
    const { service, users, passkeyCalls } = build();
    const account = await users.createWithPasskey('hash:ana@example.com', NEW_USER_DEFAULTS);

    await expect(service.passkeyRegistrationOptions(account.id)).rejects.toMatchObject({ code: 'PASSKEY_ALREADY_ADDED' });
    expect(passkeyCalls).toEqual([]);
  });
});

describe('AuthService: the administrator', () => {
  const admins = new AdminIdentities(['boss@example.test'], hash);
  const boss = async () => ({ email: 'boss@example.test', name: 'Boss', googleId: 'g-boss' });

  it('is the administrator only after Google confirms their email, and the session says so', async () => {
    const { service, claimsSeen } = build({ admins, googleIdentities: { verify: boss } });

    const signedIn = await service.signInWithGoogle('access-token');

    expect(signedIn.user.isAdmin).toBe(true);
    expect(claimsSeen).toEqual([{ admin: true }]);
  });

  it('gives every other customer an ordinary session', async () => {
    const { service, claimsSeen } = build({ admins });

    const signedIn = await service.signInWithGoogle('access-token');

    expect(signedIn.user.isAdmin).toBe(false);
    expect(claimsSeen).toEqual([{ admin: false }]);
  });
});

describe('AuthService: last sign-in', () => {
  it('records when a customer signed in with Google', async () => {
    const { service, users } = build();
    const signedIn = await service.signInWithGoogle('access-token');
    expect(users.lastLoginOf(signedIn.user.id)).toEqual(SIGNED_IN_AT);
  });

  it('records nothing for a sign-in that was refused', async () => {
    const { service, users } = build({
      googleIdentities: {
        verify: async () => {
          throw new Error('nope');
        },
      },
    });
    await expect(service.signInWithGoogle('bad')).rejects.toBeInstanceOf(SignInRejectedError);
    expect(users.size).toBe(0);
  });
});

describe('AuthService: closed registration', () => {
  const closed = { allowRegistration: false };
  const admins = new AdminIdentities(['boss@example.test'], hash);

  it('lets someone who already has an account sign in with Google', async () => {
    const { service, users } = build(closed);
    await users.create('hash:verified@example.com', NEW_USER_DEFAULTS);

    const signedIn = await service.signInWithGoogle('access-token');

    expect(signedIn.user.id).toBe('user-1');
  });

  it('refuses a Google sign-in that would create an account, and creates nothing', async () => {
    const { service, users } = build(closed);

    await expect(service.signInWithGoogle('access-token')).rejects.toMatchObject({ code: 'REGISTRATION_CLOSED' });

    expect(users.size).toBe(0);
  });

  it('still lets the administrator create their own account, or nobody could ever sign in', async () => {
    const { service, users } = build({ ...closed, admins, googleIdentities: { verify: async () => ({ email: 'boss@example.test', googleId: 'g-boss' }) } });

    const signedIn = await service.signInWithGoogle('access-token');

    expect(signedIn.user.isAdmin).toBe(true);
    expect(users.size).toBe(1);
  });

  it('records no sign-in for a refused one', async () => {
    const { service, users } = build(closed);
    await expect(service.signInWithGoogle('access-token')).rejects.toBeInstanceOf(SignInRejectedError);
    expect(users.lastLoginOf('user-1')).toBeNull();
  });
});
