import { z } from 'zod';
import { parseAdminEmails } from '../application/adminIdentities';
import { PROFILE_ENCRYPTION_KEY_PATTERN } from '../infrastructure/aesGcmFieldCipher';

/** Every setting the server reads, parsed once at start. Past this point nothing asks the environment for anything. */
export interface AppConfig {
  readonly nodeEnv: 'development' | 'production' | 'test';
  readonly port: number;
  readonly jwtSecret: string;
  readonly userHashSalt: string;
  readonly profileEncryptionKey: string | undefined;
  /** The passkey identity: the site's domain, and the exact address the browser shows. */
  readonly rpId: string;
  readonly origin: string;
  readonly googleClientId: string | undefined;
  readonly adminEmails: readonly string[];
  /** How many reverse proxies stand in front of the API (0 for none). It decides which address counts as the client's. */
  readonly trustProxy: number;
  /** False closes sign-up: only people who already have an account can sign in. */
  readonly allowRegistration: boolean;
  /** "Try the demo": a private demo account for every visit. Off by default in production unless set. */
  readonly enableDemo: boolean;
  readonly benchmarkRefresh: boolean;
}

/** The setting is missing or wrong. `problems` name the variables and say what is expected, never what was found. */
export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`The server cannot start, its settings are not right:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

const MIN_SECRET_LENGTH = 32;

/** A copied .env.example has empty values: they mean "not set". */
const nothingIfEmpty = (value: string | undefined): string | undefined => (value === undefined || value.trim() === '' ? undefined : value.trim());

const switchValue = z.enum(['true', 'false'], { error: 'must be "true" or "false"' }).transform((value) => value === 'true');

const settings = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test'], { error: 'must be development, production or test' }),
  PORT: z.coerce.number({ error: 'must be a port number' }).int().min(1, 'must be a port number').max(65535, 'must be a port number'),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  USER_HASH_SALT: z.string().optional(),
  PROFILE_ENCRYPTION_KEY: z.string().regex(PROFILE_ENCRYPTION_KEY_PATTERN, 'must be 32 random bytes as base64 (openssl rand -base64 32)').optional(),
  RP_ID: z.string().optional(),
  ORIGIN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  TRUST_PROXY: z.coerce.number({ error: 'must be a whole number from 0 to 10' }).int().min(0, 'must be a whole number from 0 to 10').max(10, 'must be a whole number from 0 to 10'),
  ALLOW_REGISTRATION: switchValue,
  ENABLE_DEMO: switchValue.optional(),
  BENCHMARK_REFRESH: z.string().optional(),
});

const NAMES = Object.keys(settings.shape);

const isLocalOrigin = (url: URL) => url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

/**
 * Parse, don't validate: the environment becomes a typed AppConfig, or the server refuses to start. Production
 * must say everything itself (no localhost defaults, long secrets); development only needs the two secrets.
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const raw: Record<string, string | undefined> = {};
  for (const name of NAMES) raw[name] = nothingIfEmpty(env[name]);
  raw.NODE_ENV ??= 'development';
  raw.PORT ??= '3000';
  raw.TRUST_PROXY ??= '0';
  raw.ALLOW_REGISTRATION ??= 'true';

  const parsed = settings.safeParse(raw);
  const problems: string[] = parsed.success ? [] : parsed.error.issues.map((issue) => `${String(issue.path[0])}: ${issue.message}`);

  // Checks that need several settings at once run on the raw text, so every problem is reported together.
  const production = raw.NODE_ENV === 'production';
  for (const name of ['JWT_SECRET', 'USER_HASH_SALT'] as const) {
    const value = raw[name];
    if (value === undefined) problems.push(`${name}: is required`);
    else if (production && value.length < MIN_SECRET_LENGTH) problems.push(`${name}: must be at least ${MIN_SECRET_LENGTH} characters (openssl rand -base64 48)`);
  }
  if (production) {
    for (const name of ['DATABASE_URL', 'PROFILE_ENCRYPTION_KEY', 'RP_ID', 'ORIGIN'] as const) {
      if (raw[name] === undefined) problems.push(`${name}: is required in production`);
    }
  }

  const rpId = raw.RP_ID ?? (production ? '' : 'localhost');
  const origin = raw.ORIGIN ?? (production ? '' : 'http://localhost:5173');
  if (origin !== '') {
    try {
      const url = new URL(origin);
      if (production && url.protocol !== 'https:' && !isLocalOrigin(url)) problems.push('ORIGIN: must be an https address in production');
      if (rpId !== '' && url.hostname !== rpId && !url.hostname.endsWith(`.${rpId}`)) problems.push('RP_ID: must be the domain of ORIGIN (or a parent domain of it)');
    } catch {
      problems.push('ORIGIN: must be a full address such as https://portfolio.example.com');
    }
  }

  const values = parsed.success ? parsed.data : undefined;
  if (!values || values.JWT_SECRET === undefined || values.USER_HASH_SALT === undefined || problems.length > 0) throw new ConfigError(problems);

  return {
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    jwtSecret: values.JWT_SECRET,
    userHashSalt: values.USER_HASH_SALT,
    profileEncryptionKey: values.PROFILE_ENCRYPTION_KEY,
    rpId,
    origin,
    googleClientId: values.GOOGLE_CLIENT_ID,
    adminEmails: parseAdminEmails(values.ADMIN_EMAILS),
    trustProxy: values.TRUST_PROXY,
    allowRegistration: values.ALLOW_REGISTRATION,
    enableDemo: values.ENABLE_DEMO ?? !production,
    benchmarkRefresh: values.BENCHMARK_REFRESH !== 'off',
  };
}
