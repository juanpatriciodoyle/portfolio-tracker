// Must stay the first import: it loads apps/api/.env before any other module reads process.env.
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { OAuth2Client } from 'google-auth-library';
import { ConfigError, loadConfig } from './lib/config';
import { configureIdentityHashing, hashUserIdentity } from './lib/privacy';
import { errorName, log } from './lib/logger';
import { createShutdown } from './lib/shutdown';
import { db } from './lib/db';
import { syncCountryInflationHistory } from './lib/inflationService';
import { generateToken } from './lib/auth';
import { tickerSearch } from './lib/financialFetcher';
import { ensureDemoUserWithData, isDemoUserId, resetDemoUser } from './lib/demoSeed';
import { AdminIdentities } from './application/adminIdentities';
import { AuthService } from './application/authService';
import { UsageAnalyticsService } from './application/usageAnalyticsService';
import { SlidingWindowRateLimiter } from './application/limits';
import { MarketSearchService } from './application/marketSearchService';
import { GoogleIdentityVerifier } from './infrastructure/googleIdentityVerifier';
import { PrismaUsageStatistics } from './infrastructure/prismaUsageStatistics';
import { PrismaUserRepository } from './infrastructure/prismaUserRepository';
import { createPasskeyAuthenticator } from './infrastructure/simpleWebAuthnPasskeys';
import { scheduleBenchmarkRefresh } from './infrastructure/benchmarks/refreshSchedule';
import { createPrismaPortfolioDeps } from './infrastructure/prismaPortfolioDeps';
import { createAdminAnalyticsRouter } from './routes/adminAnalytics';
import { createAppConfigRouter } from './routes/appConfig';
import { createAuthRouter } from './routes/auth';
import { createDemoRouter, createDisabledDemoRouter } from './routes/demo';
import { apiErrorHandler, apiNotFound, JSON_BODY_LIMIT } from './routes/fallbacks';
import { createHealthRouter } from './routes/health';
import { createMarketRouter } from './routes/market';
import { createPortfolioRouter } from './routes/portfolio';
import { mountProfileFeature } from './routes/profileFeature';
import { requestLogger } from './routes/requestLogger';

/** Every setting is read here, once. A server that is not set up properly says what is wrong and does not start. */
function readConfig() {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

const config = readConfig();
configureIdentityHashing(config.userHashSalt);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(helmet());
app.use(requestLogger(log));
app.use(express.json({ limit: JSON_BODY_LIMIT }));

// Liveness and readiness: what Docker and any monitor ask.
app.use('/api', createHealthRouter({ checkDatabase: async () => void (await db.$queryRaw`SELECT 1`) }));

// What the sign-in screen needs to know before anyone is signed in.
app.use('/api', createAppConfigRouter({ demoEnabled: config.enableDemo }));

// Profile, living phases and fixed costs (field-level encrypted; see routes/profileFeature.ts).
const { benchmarkRefresher } = mountProfileFeature(app, {
  env: { NODE_ENV: config.nodeEnv, PROFILE_ENCRYPTION_KEY: config.profileEncryptionKey },
  prisma: db,
});

// The original portfolio endpoints; every one acts for the bearer-token holder only.
app.use('/api', createPortfolioRouter(createPrismaPortfolioDeps(db)));

// The administrator is whoever Google confirms to own an email listed in ADMIN_EMAILS; nobody else, and never through a passkey.
const admins = new AdminIdentities(config.adminEmails, hashUserIdentity);
const users = new PrismaUserRepository(db);

// Passwordless sign-in (Google and passkeys): no password, and no email, is ever stored.
const auth = new AuthService({
  users,
  // Without GOOGLE_CLIENT_ID the server still starts (passkeys and the demo work) but refuses every Google sign-in.
  googleIdentities: new GoogleIdentityVerifier(new OAuth2Client(), config.googleClientId),
  passkeys: createPasskeyAuthenticator({ rpId: config.rpId, origin: config.origin }),
  hashIdentity: hashUserIdentity,
  issueToken: generateToken,
  admins,
  allowRegistration: config.allowRegistration,
  now: () => new Date(),
});
const signInAttempts = new SlidingWindowRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000, now: Date.now });
app.use('/api', createAuthRouter(auth, { limiter: signInAttempts }));

// How many customers use the app: the administrator only.
app.use('/api', createAdminAnalyticsRouter(new UsageAnalyticsService({ users, admins, statistics: new PrismaUsageStatistics(db), now: () => new Date() })));

// Autocomplete of the instrument being logged.
app.use('/api', createMarketRouter(new MarketSearchService({ tickers: tickerSearch })));

// Guest mode ("Sneak peek" as Joe): ephemeral, wiped on sign-out and before every new guest session. Switched off, it does not exist.
app.use('/api', config.enableDemo ? createDemoRouter({ restore: resetDemoUser, isGuestAccount: isDemoUserId }) : createDisabledDemoRouter());

app.use('/api', apiNotFound);
app.use(apiErrorHandler(log));

const stoppers: Array<() => void> = [];

const server = app.listen(config.port, () => {
  log.info('server_started', { port: config.port, env: config.nodeEnv, registration: config.allowRegistration ? 'open' : 'closed', demo: config.enableDemo });
  void prepare();
});

/** Work that must not hold up answering: the guest's data (when there is a guest) and the inflation history. */
async function prepare(): Promise<void> {
  try {
    if (config.enableDemo) await ensureDemoUserWithData();
    await syncCountryInflationHistory('Spain');
  } catch (error) {
    log.error('startup_tasks_failed', { error: errorName(error) });
  }
  if (benchmarkRefresher && config.benchmarkRefresh) stoppers.push(scheduleBenchmarkRefresh(benchmarkRefresher));
}

const shutdown = createShutdown({
  stop: [() => stoppers.forEach((stop) => stop())],
  closeServer: () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeIdleConnections();
    }),
  disconnect: () => db.$disconnect(),
  logger: log,
  exit: (code) => process.exit(code),
  graceMs: 10_000,
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
