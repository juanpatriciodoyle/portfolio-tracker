import { ConfigError, loadConfig } from '../lib/config';

const KEY = Buffer.alloc(32, 7).toString('base64');
const LONG = 'x'.repeat(40);

const development = { NODE_ENV: 'development', JWT_SECRET: 'dev-secret', USER_HASH_SALT: 'dev-salt' };
const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:pw@db:5432/portfolio',
  JWT_SECRET: LONG,
  USER_HASH_SALT: LONG,
  PROFILE_ENCRYPTION_KEY: KEY,
  RP_ID: 'portfolio.example.test',
  ORIGIN: 'https://portfolio.example.test',
};

const problemsOf = (env: Record<string, string | undefined>): readonly string[] => {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
};

describe('loadConfig: development', () => {
  it('needs only a session secret and a salt, and fills in the local defaults', () => {
    expect(loadConfig(development)).toEqual({
      nodeEnv: 'development',
      port: 3000,
      jwtSecret: 'dev-secret',
      userHashSalt: 'dev-salt',
      profileEncryptionKey: undefined,
      rpId: 'localhost',
      origin: 'http://localhost:5173',
      googleClientId: undefined,
      adminEmails: [],
      trustProxy: 0,
      allowRegistration: true,
      enableDemo: true,
      benchmarkRefresh: true,
    });
  });

  it('treats a missing NODE_ENV as development', () => {
    expect(loadConfig({ JWT_SECRET: 'a', USER_HASH_SALT: 'b' }).nodeEnv).toBe('development');
  });

  it('has no built-in salt or secret: without them it will not start', () => {
    expect(problemsOf({ NODE_ENV: 'development' })).toEqual(expect.arrayContaining([expect.stringContaining('JWT_SECRET'), expect.stringContaining('USER_HASH_SALT')]));
  });

  it('still checks a profile key that is given', () => {
    expect(problemsOf({ ...development, PROFILE_ENCRYPTION_KEY: 'short' })).toEqual([expect.stringContaining('PROFILE_ENCRYPTION_KEY')]);
  });
});

describe('loadConfig: production', () => {
  it('accepts a complete setup, with the demo off by default', () => {
    expect(loadConfig(production)).toMatchObject({
      nodeEnv: 'production',
      rpId: 'portfolio.example.test',
      origin: 'https://portfolio.example.test',
      profileEncryptionKey: KEY,
      enableDemo: false,
      allowRegistration: true,
      trustProxy: 0,
    });
  });

  it.each(['DATABASE_URL', 'JWT_SECRET', 'USER_HASH_SALT', 'PROFILE_ENCRYPTION_KEY', 'RP_ID', 'ORIGIN'])('refuses to start without %s, naming it', (name) => {
    const env: Record<string, string | undefined> = { ...production };
    delete env[name];
    const problems = problemsOf(env);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((problem) => problem.startsWith(name))).toBe(true);
  });

  it('wants a long session secret and a long salt', () => {
    expect(problemsOf({ ...production, JWT_SECRET: 'short' })).toEqual([expect.stringContaining('JWT_SECRET')]);
    expect(problemsOf({ ...production, USER_HASH_SALT: 'short' })).toEqual([expect.stringContaining('USER_HASH_SALT')]);
  });

  it('has no localhost defaults for the passkey identity', () => {
    const env: Record<string, string | undefined> = { ...production };
    delete env.RP_ID;
    delete env.ORIGIN;
    expect(problemsOf(env)).toHaveLength(2);
  });

  it('needs https, except for localhost (the throwaway test stack)', () => {
    expect(problemsOf({ ...production, ORIGIN: 'http://portfolio.example.test' })).toEqual([expect.stringContaining('ORIGIN')]);
    expect(problemsOf({ ...production, RP_ID: 'localhost', ORIGIN: 'http://localhost:8080' })).toEqual([]);
  });

  it('wants the passkey id to belong to the origin', () => {
    expect(problemsOf({ ...production, RP_ID: 'other.example.test' })).toEqual([expect.stringContaining('RP_ID')]);
    expect(problemsOf({ ...production, RP_ID: 'example.test' })).toEqual([]);
  });

  it('never repeats a value in what it reports', () => {
    const problems = problemsOf({ ...production, JWT_SECRET: 'super-secret-short', PROFILE_ENCRYPTION_KEY: 'a-bad-key-value', DATABASE_URL: '' });
    expect(problems.join(' ')).not.toMatch(/super-secret-short|a-bad-key-value/);
  });

  it('reports every problem at once, so one restart fixes them all', () => {
    expect(problemsOf({ NODE_ENV: 'production' }).length).toBeGreaterThanOrEqual(6);
  });
});

describe('loadConfig: switches', () => {
  it('reads the optional settings', () => {
    expect(
      loadConfig({
        ...production,
        PORT: '4000',
        GOOGLE_CLIENT_ID: 'client-id',
        ADMIN_EMAILS: ' boss@example.test , ,second@example.test',
        TRUST_PROXY: '1',
        ALLOW_REGISTRATION: 'false',
        ENABLE_DEMO: 'true',
        BENCHMARK_REFRESH: 'off',
      })
    ).toMatchObject({
      port: 4000,
      googleClientId: 'client-id',
      adminEmails: ['boss@example.test', 'second@example.test'],
      trustProxy: 1,
      allowRegistration: false,
      enableDemo: true,
      benchmarkRefresh: false,
    });
  });

  it('treats empty values like missing ones, as a copied .env.example has', () => {
    expect(loadConfig({ ...production, GOOGLE_CLIENT_ID: '', ADMIN_EMAILS: '', TRUST_PROXY: '', ALLOW_REGISTRATION: '', ENABLE_DEMO: '' })).toMatchObject({
      googleClientId: undefined,
      adminEmails: [],
      trustProxy: 0,
      allowRegistration: true,
      enableDemo: false,
    });
  });

  it.each([
    ['ALLOW_REGISTRATION', 'maybe'],
    ['ENABLE_DEMO', 'yes'],
    ['TRUST_PROXY', '-1'],
    ['TRUST_PROXY', 'two'],
    ['PORT', '0'],
    ['PORT', 'http'],
  ])('rejects %s=%s', (name, value) => {
    expect(problemsOf({ ...production, [name]: value })).toEqual([expect.stringContaining(name)]);
  });

  it('rejects a NODE_ENV it does not know', () => {
    expect(problemsOf({ ...production, NODE_ENV: 'staging' })).toEqual([expect.stringContaining('NODE_ENV')]);
  });
});

describe('loadConfig: human check (hCaptcha)', () => {
  const TEST_SITEKEY = '10000000-ffff-ffff-ffff-000000000001';
  const TEST_SECRET = '0x0000000000000000000000000000000000000000';

  it('is off when neither setting is given, empty values included', () => {
    expect(loadConfig(production).hcaptcha).toBeUndefined();
    expect(loadConfig({ ...development, HCAPTCHA_SECRET: '', HCAPTCHA_SITEKEY: '' }).hcaptcha).toBeUndefined();
  });

  it('is on when both are given', () => {
    expect(loadConfig({ ...production, HCAPTCHA_SECRET: TEST_SECRET, HCAPTCHA_SITEKEY: TEST_SITEKEY }).hcaptcha).toEqual({ secret: TEST_SECRET, siteKey: TEST_SITEKEY });
  });

  it.each([
    ['HCAPTCHA_SECRET', { HCAPTCHA_SITEKEY: TEST_SITEKEY }, 'HCAPTCHA_SECRET'],
    ['HCAPTCHA_SITEKEY', { HCAPTCHA_SECRET: TEST_SECRET }, 'HCAPTCHA_SITEKEY'],
  ])('refuses to start with only one of the pair, naming the one that is missing (%s)', (_name, given, missing) => {
    for (const base of [development, production]) {
      const problems = problemsOf({ ...base, ...given });
      expect(problems).toEqual([expect.stringContaining(missing)]);
      expect(problems.join(' ')).not.toContain(TEST_SECRET);
    }
  });
});
