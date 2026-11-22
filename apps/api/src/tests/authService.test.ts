import { AuthService, passkeyDisplayName, type AuthServiceDeps } from '../application/authService';
import { GoogleNotConfiguredError, SignInRejectedError } from '../application/errors';
import type { PasskeyAuthenticator, PasskeyChallenge } from '../application/ports';
import { NEW_USER_DEFAULTS } from '../domain/newUser';
import { InMemoryUserRepository } from './support/inMemoryUsers';

const challenge: PasskeyChallenge = { isRegistration: false, options: { challenge: 'abc' }, userHash: 'hash:ana@example.com' };

function build(overrides: Partial<AuthServiceDeps> = {}) {
  const users = new InMemoryUserRepository();
  const verified: string[] = [];
  const passkeyCalls: { email: string; credential: unknown }[] = [];
  const challengesMade: string[] = [];

  const passkeys: PasskeyAuthenticator = {
    challengeFor: async (email) => {
      challengesMade.push(email);
      return challenge;
    },
    verify: async (email, credential) => {
      passkeyCalls.push({ email, credential });
      return { id: 'user-passkey', country: 'Spain', hasPasskey: true };
    },
  };

  const deps: AuthServiceDeps = {
    users,
    googleIdentities: {
      verify: async (accessToken) => {
        verified.push(accessToken);
        return { email: 'verified@example.com', name: 'Verified Person', googleId: 'g-verified', avatarUrl: 'https://img/v.png' };
      },
    },
    passkeys,
    hashIdentity: (raw) => `hash:${raw}`,
    issueToken: (userId) => `token-for-${userId}`,
    ...overrides,
  };
  return { service: new AuthService(deps), users, verified, passkeyCalls, challengesMade };
}

describe('AuthService.signInWithGoogle', () => {
  it('creates a pseudonymous account for the email Google confirms, with the starting defaults, and returns a session', async () => {
    const { service, users, verified } = build();

    const signedIn = await service.signInWithGoogle('access-token');

    expect(verified).toEqual(['access-token']);
    expect(signedIn).toEqual({
      token: 'token-for-user-1',
      user: { id: 'user-1', email: 'verified@example.com', name: 'Verified Person', avatarUrl: 'https://img/v.png', country: 'Spain' },
    });
    expect(users.createdWith).toEqual([
      { userHash: 'hash:verified@example.com', defaults: { country: 'Spain', baseCurrency: 'EUR', annualInflationRate: 2.8 } },
    ]);
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

  it('fills in a neutral name when Google shares none', async () => {
    const { service } = build({
      googleIdentities: { verify: async () => ({ email: 'ana@example.com', googleId: 'g-1' }) },
    });

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

    await expect(service.signInWithGoogle('access-token')).rejects.toMatchObject({
      code: 'GOOGLE_NOT_CONFIGURED',
      message: 'Google sign-in is not set up on this server. Use a passkey.',
    });
    expect(users.size).toBe(0);
  });
});

describe('passkeyDisplayName', () => {
  it.each([
    ['juan@portfolio.local', 'Juan'],
    ['ana.maria@example.com', 'Ana.maria'],
    ['user@example.com', 'Investor'],
    ['USER@example.com', 'Investor'],
    ['Passkey@example.com', 'Investor'],
    ['x@example.com', 'X'],
  ])('names %s "%s"', (email, expected) => {
    expect(passkeyDisplayName(email)).toBe(expected);
  });
});

describe('AuthService passkey sign-in', () => {
  it('hands the challenge of the authenticator back unchanged', async () => {
    const { service } = build();
    await expect(service.passkeyChallenge('ana@example.com')).resolves.toBe(challenge);
  });

  it('signs in whoever the authenticator verifies, with the display name made from the email', async () => {
    const { service, passkeyCalls } = build();
    const credential = { id: 'cred-1', type: 'public-key' };

    const signedIn = await service.signInWithPasskey('ana@example.com', credential);

    expect(passkeyCalls).toEqual([{ email: 'ana@example.com', credential }]);
    expect(signedIn).toEqual({
      token: 'token-for-user-passkey',
      user: { id: 'user-passkey', email: 'ana@example.com', name: 'Ana', country: 'Spain' },
    });
    expect(signedIn.user).not.toHaveProperty('avatarUrl');
  });

  it('lets the reason a passkey failed reach the caller', async () => {
    const { service } = build({
      passkeys: {
        challengeFor: async () => challenge,
        verify: async () => {
          throw new Error('Authentication challenge expired or invalid.');
        },
      },
    });

    await expect(service.signInWithPasskey('ana@example.com', {})).rejects.toThrow('Authentication challenge expired or invalid.');
  });
});

describe('AuthService: a passkey cannot be added to an account that already exists', () => {
  async function withGoogleAccount() {
    const built = build();
    await built.users.create('hash:ana@example.com', NEW_USER_DEFAULTS);
    return built;
  }

  it('refuses to start a registration for an account created without a passkey (for example with Google)', async () => {
    const { service, challengesMade } = await withGoogleAccount();

    await expect(service.passkeyChallenge('ana@example.com')).rejects.toMatchObject({
      name: 'SignInRejectedError',
      code: 'PASSKEY_NEEDS_SIGN_IN',
      message: 'This account was created with Google. Sign in with Google first.',
    });
    expect(challengesMade).toEqual([]);
  });

  it('refuses to finish one, and never asks the authenticator to register', async () => {
    const { service, passkeyCalls } = await withGoogleAccount();

    await expect(service.signInWithPasskey('ana@example.com', { id: 'attacker-cred' })).rejects.toMatchObject({
      code: 'PASSKEY_NEEDS_SIGN_IN',
    });
    expect(passkeyCalls).toEqual([]);
  });

  it('still lets a brand-new email register its first passkey', async () => {
    const { service, challengesMade, passkeyCalls } = build();

    await expect(service.passkeyChallenge('new@example.com')).resolves.toBe(challenge);
    await expect(service.signInWithPasskey('new@example.com', { id: 'cred' })).resolves.toMatchObject({ token: 'token-for-user-passkey' });
    expect(challengesMade).toEqual(['new@example.com']);
    expect(passkeyCalls).toHaveLength(1);
  });

  it('still lets an account that has a passkey sign in with it', async () => {
    const { service, users, passkeyCalls } = build();
    await users.createWithPasskey('hash:ana@example.com', NEW_USER_DEFAULTS);

    await expect(service.passkeyChallenge('ana@example.com')).resolves.toBe(challenge);
    await expect(service.signInWithPasskey('ana@example.com', { id: 'cred' })).resolves.toBeDefined();
    expect(passkeyCalls).toHaveLength(1);
  });
});
