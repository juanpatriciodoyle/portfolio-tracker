import express from 'express';
import request from 'supertest';
import { AdminIdentities } from '../application/adminIdentities';
import { AuthService } from '../application/authService';
import { MarketSearchService } from '../application/marketSearchService';
import { GoogleNotConfiguredError } from '../application/errors';
import { SlidingWindowRateLimiter } from '../application/limits';
import type { PasskeyAuthenticator, TickerMatch, UserRepository, VerifiedGoogleIdentity } from '../application/ports';
import { NEW_USER_DEFAULTS } from '../domain/newUser';
import { createAuthRouter } from '../routes/auth';
import { createMarketRouter } from '../routes/market';
import { InMemoryUserRepository } from './support/inMemoryUsers';

interface Options {
  users?: UserRepository;
  verifyGoogle?: (accessToken: string) => Promise<VerifiedGoogleIdentity>;
  passkeys?: Partial<PasskeyAuthenticator>;
  attemptsAllowed?: number;
  issued?: string[];
}

const ana: VerifiedGoogleIdentity = { email: 'ana@example.com', name: 'Ana', googleId: 'g-1', avatarUrl: 'https://img/a.png' };

function buildAuth({ users = new InMemoryUserRepository(), verifyGoogle, passkeys, attemptsAllowed = 1000, issued = [] }: Options = {}) {
  const service = new AuthService({
    users,
    googleIdentities: { verify: verifyGoogle ?? (async () => ana) },
    passkeys: {
      challengeFor: async () => ({ isRegistration: true, options: { challenge: 'c' }, userHash: 'h' }),
      verify: async () => ({ id: 'user-passkey', country: 'Spain', hasPasskey: true }),
      ...passkeys,
    },
    hashIdentity: (raw) => `hash:${raw}`,
    admins: new AdminIdentities([], (raw) => `hash:${raw}`),
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
      user: { id: 'user-1', email: 'ana@example.com', name: 'Ana', avatarUrl: 'https://img/a.png', country: 'Spain', isAdmin: false },
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
      expect(response.body).toEqual({ error: 'Google did not send a sign-in token. Try signing in again.' });
    }

    expect(issued).toEqual([]);
    expect(verifications).toBe(0);
    expect(users.size).toBe(0);
  });

  it('answers 400 for an empty or wrongly typed token', async () => {
    for (const body of [{}, { accessToken: '' }, { accessToken: 42 }]) {
      const response = await request(buildAuth()).post('/api/auth/google').send(body);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Google did not send a sign-in token. Try signing in again.' });
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
    expect(response.body).toEqual({ error: 'Google could not confirm your sign-in. Try signing in again.' });
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
    expect(response.body).toEqual({ error: 'Google sign-in is not set up on this server. Use a passkey.' });
  });

  it('answers 500 with the plain message, and no detail, when the account cannot be saved', async () => {
    const users = new InMemoryUserRepository();
    users.create = async () => {
      throw new Error('connection refused: secret-host');
    };

    const response = await request(buildAuth({ users })).post('/api/auth/google').send({ accessToken: 'access-token' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Google sign-in failed on our side. Try again in a moment, or sign in with a passkey.' });
    expect(JSON.stringify(response.body)).not.toContain('secret-host');
  });
});

describe('POST /api/auth/passkey/generate-options', () => {
  it('answers with the challenge unchanged', async () => {
    const response = await request(buildAuth()).post('/api/auth/passkey/generate-options').send({ email: 'ana@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ isRegistration: true, options: { challenge: 'c' }, userHash: 'h' });
  });

  it('answers 400 and asks for the email when it is missing or empty', async () => {
    for (const body of [{}, { email: '' }]) {
      const response = await request(buildAuth()).post('/api/auth/passkey/generate-options').send(body);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Enter your email so we can find your passkey.' });
    }
  });

  it('answers 500 with the plain message when the challenge cannot be made', async () => {
    const app = buildAuth({
      passkeys: {
        challengeFor: async () => {
          throw new Error('db down');
        },
      },
    });

    const response = await request(app).post('/api/auth/passkey/generate-options').send({ email: 'ana@example.com' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Could not start the passkey prompt. Try again in a moment.' });
  });
});

describe('POST /api/auth/passkey/verify', () => {
  const credential = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: { clientDataJSON: 'x' } };

  it('answers 200 with the session and the name made from the email', async () => {
    const response = await request(buildAuth()).post('/api/auth/passkey/verify').send({ email: 'juan@portfolio.local', credential });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      token: 'token-for-user-passkey',
      user: { id: 'user-passkey', email: 'juan@portfolio.local', name: 'Juan', country: 'Spain', isAdmin: false },
    });
  });

  it('answers 400 and says what is missing when the email or the credential is', async () => {
    for (const body of [{}, { email: 'ana@example.com' }, { credential }, { email: '', credential }]) {
      const response = await request(buildAuth()).post('/api/auth/passkey/verify').send(body);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Enter your email and confirm the passkey prompt to sign in.' });
    }
  });

  it('answers 400 with the reason the passkey failed', async () => {
    const app = buildAuth({
      passkeys: {
        verify: async () => {
          throw new Error('Authentication challenge expired or invalid.');
        },
      },
    });

    const response = await request(app).post('/api/auth/passkey/verify').send({ email: 'ana@example.com', credential });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Authentication challenge expired or invalid.' });
  });

  it('answers 400 with the plain message when the failure has no message', async () => {
    const app = buildAuth({
      passkeys: {
        verify: async () => {
          throw new Error('');
        },
      },
    });

    const response = await request(app).post('/api/auth/passkey/verify').send({ email: 'ana@example.com', credential });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'The passkey could not be verified. Try again, or sign in another way.' });
  });
});

describe('passkeys never take over an account that already exists', () => {
  async function appWithGoogleAccount() {
    const users = new InMemoryUserRepository();
    await users.create('hash:ana@example.com', NEW_USER_DEFAULTS);
    return buildAuth({ users });
  }
  const credential = { id: 'attacker', rawId: 'attacker', type: 'public-key', response: { clientDataJSON: 'x' } };
  const refusal = { error: 'This account was created with Google. Sign in with Google first.' };

  it('answers 403 when asked for registration options for such an account', async () => {
    const response = await request(await appWithGoogleAccount())
      .post('/api/auth/passkey/generate-options')
      .send({ email: 'ana@example.com' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(refusal);
  });

  it('answers 403 when asked to finish registering on such an account, and issues no session', async () => {
    const response = await request(await appWithGoogleAccount())
      .post('/api/auth/passkey/verify')
      .send({ email: 'ana@example.com', credential });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(refusal);
    expect(response.body).not.toHaveProperty('token');
  });

  it('still answers 200 for an email nobody has used', async () => {
    const response = await request(buildAuth()).post('/api/auth/passkey/generate-options').send({ email: 'new@example.com' });
    expect(response.status).toBe(200);
  });
});

describe('sign-in attempts are rate limited', () => {
  const credential = { id: 'c', rawId: 'c', type: 'public-key', response: {} };

  it('answers 429 with a Retry-After header once the allowance for an address is used', async () => {
    const app = buildAuth({ attemptsAllowed: 2 });

    expect((await request(app).post('/api/auth/google').send({ accessToken: 'a' })).status).toBe(200);
    expect((await request(app).post('/api/auth/google').send({ accessToken: 'a' })).status).toBe(200);
    const limited = await request(app).post('/api/auth/google').send({ accessToken: 'a' });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'Too many sign-in attempts. Wait a moment and try again.' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts the three sign-in endpoints together', async () => {
    const app = buildAuth({ attemptsAllowed: 2 });

    await request(app).post('/api/auth/google').send({ accessToken: 'a' });
    await request(app).post('/api/auth/passkey/generate-options').send({ email: 'ana@example.com' });

    expect((await request(app).post('/api/auth/passkey/verify').send({ email: 'ana@example.com', credential })).status).toBe(429);
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
