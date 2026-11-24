import express from 'express';
import request from 'supertest';
import { AdminIdentities } from '../application/adminIdentities';
import { AuthService } from '../application/authService';
import { MarketSearchService } from '../application/marketSearchService';
import { GoogleNotConfiguredError, SignInRejectedError } from '../application/errors';
import { SlidingWindowRateLimiter } from '../application/limits';
import type { PasskeyAuthenticator, TickerMatch, UserRepository, VerifiedGoogleIdentity } from '../application/ports';
import { generateToken } from '../lib/auth';
import { NEW_USER_DEFAULTS } from '../domain/newUser';
import { createAuthRouter } from '../routes/auth';
import { createMarketRouter } from '../routes/market';
import { InMemoryUserRepository } from './support/inMemoryUsers';

interface Options {
  allowRegistration?: boolean;
  users?: UserRepository;
  verifyGoogle?: (accessToken: string) => Promise<VerifiedGoogleIdentity>;
  passkeys?: Partial<PasskeyAuthenticator>;
  attemptsAllowed?: number;
  issued?: string[];
}

const ana: VerifiedGoogleIdentity = { email: 'ana@example.com', name: 'Ana', googleId: 'g-1', avatarUrl: 'https://img/a.png' };

function buildAuth({ allowRegistration = true, users = new InMemoryUserRepository(), verifyGoogle, passkeys, attemptsAllowed = 1000, issued = [] }: Options = {}) {
  const service = new AuthService({
    users,
    googleIdentities: { verify: verifyGoogle ?? (async () => ana) },
    passkeys: {
      signInChallenge: async () => ({ challengeId: 'challenge-1', options: { challenge: 'c' } }),
      verifySignIn: async () => ({ id: 'user-passkey', country: 'Spain', hasPasskey: true, isGuest: false }),
      registrationOptions: async () => ({ challenge: 'reg' }),
      register: async () => undefined,
      ...passkeys,
    },
    hashIdentity: (raw) => `hash:${raw}`,
    admins: new AdminIdentities([], (raw) => `hash:${raw}`),
    allowRegistration,
    now: () => new Date('2026-11-22T10:30:00.000Z'),
    issueToken: (userId) => {
      issued.push(userId);
      return `token-for-${userId}`;
    },
  });
  const app = express();
  app.use(express.json());
  const limiter = new SlidingWindowRateLimiter({ limit: attemptsAllowed, windowMs: 10 * 60 * 1000, now: () => 0 });
  app.use('/api', createAuthRouter(service, { limiter }));
  return app;
}

const bearer = (userId: string) => `Bearer ${generateToken(userId)}`;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/auth/google', () => {
  it('answers 200 with the session in the shape the web app reads, for the identity Google confirms', async () => {
    const response = await request(buildAuth()).post('/api/auth/google').send({ accessToken: 'access-token' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      token: 'token-for-user-1',
      user: { id: 'user-1', email: 'ana@example.com', name: 'Ana', avatarUrl: 'https://img/a.png', country: 'Spain', isAdmin: false, hasPasskey: false, isGuest: false },
    });
  });

  it('hands the token to the verifier, and nothing else from the body', async () => {
    const seen: string[] = [];
    const app = buildAuth({
      verifyGoogle: async (token) => {
        seen.push(token);
        return ana;
      },
    });

    await request(app).post('/api/auth/google').send({ accessToken: 'the-token', email: 'victim@example.com', googleId: 'g-victim' });

    expect(seen).toEqual(['the-token']);
  });

  it('rejects a body that only CLAIMS an identity: no session is issued, nobody is verified, no account is made', async () => {
    const users = new InMemoryUserRepository();
    const issued: string[] = [];
    let verifications = 0;
    const app = buildAuth({
      users,
      issued,
      verifyGoogle: async () => {
        verifications += 1;
        return ana;
      },
    });

    for (const body of [
      { email: 'victim@example.com' },
      { email: 'victim@example.com', name: 'Victim', googleId: 'g-victim', avatarUrl: 'https://img/v.png' },
      { credential: 'old-style-id-token', email: 'victim@example.com' },
    ]) {
      const response = await request(app).post('/api/auth/google').send(body);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Google did not send a sign-in token. Try signing in again.', code: 'GOOGLE_TOKEN_NEEDED' });
    }

    expect(issued).toEqual([]);
    expect(verifications).toBe(0);
    expect(users.size).toBe(0);
  });

  it('answers 400 for an empty or wrongly typed token', async () => {
    for (const body of [{}, { accessToken: '' }, { accessToken: 42 }]) {
      const response = await request(buildAuth()).post('/api/auth/google').send(body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'GOOGLE_TOKEN_NEEDED' });
    }
  });

  it('answers 401 when Google does not confirm the token, and issues nothing', async () => {
    const issued: string[] = [];
    const app = buildAuth({
      issued,
      verifyGoogle: async () => {
        throw new Error('bad signature');
      },
    });

    const response = await request(app).post('/api/auth/google').send({ accessToken: 'forged' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Google could not confirm your sign-in. Try signing in again.', code: 'GOOGLE_TOKEN_UNVERIFIED' });
    expect(issued).toEqual([]);
  });

  it('answers 503 and says Google sign-in is not set up, when the server has no Google client', async () => {
    const app = buildAuth({
      verifyGoogle: async () => {
        throw new GoogleNotConfiguredError();
      },
    });

    const response = await request(app).post('/api/auth/google').send({ accessToken: 'access-token' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Google sign-in is not set up on this server.', code: 'GOOGLE_NOT_CONFIGURED' });
  });

  it('answers 403 REGISTRATION_CLOSED, with its code, when sign-up is closed', async () => {
    const response = await request(buildAuth({ allowRegistration: false })).post('/api/auth/google').send({ accessToken: 'access-token' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'REGISTRATION_CLOSED' });
  });

  it('answers 500 with the plain message, and no detail, when the account cannot be saved', async () => {
    const users = new InMemoryUserRepository();
    users.create = async () => {
      throw new Error('connection refused: secret-host');
    };

    const response = await request(buildAuth({ users })).post('/api/auth/google').send({ accessToken: 'access-token' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Google sign-in failed on our side. Try again in a moment.', code: 'GOOGLE_SIGN_IN_FAILED' });
    expect(JSON.stringify(response.body)).not.toContain('secret-host');
  });
});

describe('POST /api/auth/passkey/sign-in/options', () => {
  it('answers the question and the id to answer it with, asking nobody for an email', async () => {
    const response = await request(buildAuth()).post('/api/auth/passkey/sign-in/options').send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ challengeId: 'challenge-1', options: { challenge: 'c' } });
  });

  it('answers 500 with the plain message when the question cannot be made', async () => {
    const app = buildAuth({
      passkeys: {
        signInChallenge: async () => {
          throw new Error('db down');
        },
      },
    });

    const response = await request(app).post('/api/auth/passkey/sign-in/options').send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Could not start the passkey prompt. Try again in a moment.', code: 'PASSKEY_START_FAILED' });
  });
});

describe('POST /api/auth/passkey/sign-in/verify', () => {
  const credential = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: { clientDataJSON: 'x' } };

  it('answers 200 with the session: no email, because none is known', async () => {
    const response = await request(buildAuth()).post('/api/auth/passkey/sign-in/verify').send({ challengeId: 'challenge-1', credential });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      token: 'token-for-user-passkey',
      user: { id: 'user-passkey', name: 'Investor', country: 'Spain', isAdmin: false, hasPasskey: true, isGuest: false },
    });
  });

  it('answers 400 PASSKEY_REQUEST_INVALID when the challenge id or the credential is missing', async () => {
    for (const body of [{}, { challengeId: 'challenge-1' }, { credential }, { challengeId: '', credential }]) {
      const response = await request(buildAuth()).post('/api/auth/passkey/sign-in/verify').send(body);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'PASSKEY_REQUEST_INVALID' });
    }
  });

  it('answers with the code of the reason the passkey was refused, never with the library’s words', async () => {
    const app = buildAuth({
      passkeys: {
        verifySignIn: async () => {
          throw new SignInRejectedError('PASSKEY_UNKNOWN');
        },
      },
    });

    const response = await request(app).post('/api/auth/passkey/sign-in/verify').send({ challengeId: 'challenge-1', credential });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'PASSKEY_UNKNOWN' });
  });

  it('answers 400 PASSKEY_UNVERIFIED, and no detail, when something unexpected goes wrong', async () => {
    const app = buildAuth({
      passkeys: {
        verifySignIn: async () => {
          throw new Error('Unexpected authentication response origin "https://secret-host"');
        },
      },
    });

    const response = await request(app).post('/api/auth/passkey/sign-in/verify').send({ challengeId: 'challenge-1', credential });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'PASSKEY_UNVERIFIED' });
    expect(JSON.stringify(response.body)).not.toContain('secret-host');
  });
});

describe('adding a passkey when signed in', () => {
  const credential = { id: 'new-cred', rawId: 'new-cred', type: 'public-key', response: { attestationObject: 'x' } };

  async function appWithAccount() {
    const users = new InMemoryUserRepository();
    const account = await users.create('hash:ana@example.com', NEW_USER_DEFAULTS);
    return { app: buildAuth({ users }), account, users };
  }

  it('needs a session: nobody can add a passkey by naming an account', async () => {
    const { app } = await appWithAccount();

    expect((await request(app).post('/api/auth/passkey/register/options').send({})).status).toBe(401);
    expect((await request(app).post('/api/auth/passkey/register/verify').send({ credential })).status).toBe(401);
  });

  it('answers the options for the account in the session', async () => {
    const { app, account } = await appWithAccount();

    const response = await request(app).post('/api/auth/passkey/register/options').set('Authorization', bearer(account.id)).send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ options: { challenge: 'reg' } });
  });

  it('saves the passkey for the account in the session and answers 204', async () => {
    const registered: string[] = [];
    const users = new InMemoryUserRepository();
    const account = await users.create('hash:ana@example.com', NEW_USER_DEFAULTS);
    const app = buildAuth({ users, passkeys: { register: async (userId) => void registered.push(userId) } });

    const response = await request(app).post('/api/auth/passkey/register/verify').set('Authorization', bearer(account.id)).send({ credential });

    expect(response.status).toBe(204);
    expect(registered).toEqual([account.id]);
  });

  it('answers 400 PASSKEY_REQUEST_INVALID for an answer that does not look like a passkey', async () => {
    const { app, account } = await appWithAccount();

    const response = await request(app).post('/api/auth/passkey/register/verify').set('Authorization', bearer(account.id)).send({ credential: 'nope' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'PASSKEY_REQUEST_INVALID' });
  });

  it('answers 403 for a demo guest, and 409 when the account already has a passkey', async () => {
    const users = new InMemoryUserRepository();
    users.addGuest('guest-1');
    const withPasskey = await users.createWithPasskey('hash:bea@example.com', NEW_USER_DEFAULTS);
    const app = buildAuth({ users });

    const guest = await request(app).post('/api/auth/passkey/register/options').set('Authorization', bearer('guest-1')).send({});
    const already = await request(app).post('/api/auth/passkey/register/options').set('Authorization', bearer(withPasskey.id)).send({});

    expect(guest.status).toBe(403);
    expect(guest.body).toMatchObject({ code: 'PASSKEY_NOT_FOR_GUEST' });
    expect(already.status).toBe(409);
    expect(already.body).toMatchObject({ code: 'PASSKEY_ALREADY_ADDED' });
  });

  it('answers 404 for a session whose account no longer exists', async () => {
    const response = await request(buildAuth()).post('/api/auth/passkey/register/options').set('Authorization', bearer('ghost')).send({});
    expect(response.status).toBe(404);
  });
});

describe('sign-in attempts are rate limited', () => {
  const credential = { id: 'c', rawId: 'c', type: 'public-key', response: {} };

  it('answers 429 with a Retry-After header and a code once the allowance for an address is used', async () => {
    const app = buildAuth({ attemptsAllowed: 2 });

    expect((await request(app).post('/api/auth/google').send({ accessToken: 'a' })).status).toBe(200);
    expect((await request(app).post('/api/auth/google').send({ accessToken: 'a' })).status).toBe(200);
    const limited = await request(app).post('/api/auth/google').send({ accessToken: 'a' });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'Too many sign-in attempts. Wait a moment and try again.', code: 'TOO_MANY_ATTEMPTS' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts every sign-in endpoint together', async () => {
    const app = buildAuth({ attemptsAllowed: 2 });

    await request(app).post('/api/auth/google').send({ accessToken: 'a' });
    await request(app).post('/api/auth/passkey/sign-in/options').send({});

    expect((await request(app).post('/api/auth/passkey/sign-in/verify').send({ challengeId: 'challenge-1', credential })).status).toBe(429);
  });

  it('also limits adding a passkey', async () => {
    const users = new InMemoryUserRepository();
    const account = await users.create('hash:ana@example.com', NEW_USER_DEFAULTS);
    const app = buildAuth({ users, attemptsAllowed: 1 });

    await request(app).post('/api/auth/google').send({ accessToken: 'a' });

    expect((await request(app).post('/api/auth/passkey/register/options').set('Authorization', bearer(account.id)).send({})).status).toBe(429);
  });

  it('does not run the sign-in at all for a refused attempt', async () => {
    let verifications = 0;
    const app = buildAuth({
      attemptsAllowed: 1,
      verifyGoogle: async () => {
        verifications += 1;
        return ana;
      },
    });

    await request(app).post('/api/auth/google').send({ accessToken: 'a' });
    await request(app).post('/api/auth/google').send({ accessToken: 'a' });

    expect(verifications).toBe(1);
  });
});

describe('GET /api/market/search', () => {
  const apple: TickerMatch = { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'Stock', sector: 'Technology' };

  function buildMarket(search: (query: string) => Promise<readonly TickerMatch[]>) {
    const app = express();
    app.use('/api', createMarketRouter(new MarketSearchService({ tickers: { search } })));
    return app;
  }

  it('answers the matches', async () => {
    const response = await request(buildMarket(async () => [apple])).get('/api/market/search').query({ q: 'AAP' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([apple]);
  });

  it('answers an empty list for a short or missing query without asking the market', async () => {
    let asked = 0;
    const app = buildMarket(async () => {
      asked += 1;
      return [apple];
    });

    for (const query of [{}, { q: '' }, { q: 'AA' }]) {
      const response = await request(app).get('/api/market/search').query(query);
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    }
    expect(asked).toBe(0);
  });

  it('answers 500 with the plain message when the search fails', async () => {
    const app = buildMarket(async () => {
      throw new Error('offline');
    });

    const response = await request(app).get('/api/market/search').query({ q: 'AAPL' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Ticker search is unavailable right now. Try again in a moment, or type the symbol yourself.',
    });
  });
});

describe('closed registration', () => {
  it('answers a Google sign-in for a new person with 403 and a plain message', async () => {
    const response = await request(buildAuth({ allowRegistration: false })).post('/api/auth/google').send({ accessToken: 'token' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'New accounts are closed right now. Ask the owner of this app for access.', code: 'REGISTRATION_CLOSED' });
  });
});
