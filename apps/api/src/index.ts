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
import { AdminIdentities } from './application/adminIdentities';
import { AuthService } from './application/authService';
import { DemoGuestSeeder } from './application/guestSeeder';
import { GuestService } from './application/guestService';
import { UsageAnalyticsService } from './application/usageAnalyticsService';
import { SlidingWindowRateLimiter } from './application/limits';
import { MarketSearchService } from './application/marketSearchService';
import { HCaptchaVerifier } from './infrastructure/hcaptchaVerifier';
import { GoogleIdentityVerifier } from './infrastructure/googleIdentityVerifier';
import { PrismaUsageStatistics } from './infrastructure/prismaUsageStatistics';
import { PrismaUserRepository } from './infrastructure/prismaUserRepository';
import { createPasskeyAuthenticator } from './infrastructure/simpleWebAuthnPasskeys';
import { REFERENCE_EUR_RATES } from './infrastructure/fx/referenceFxRates';
import { marketPrices } from './infrastructure/market/marketPrices';
import { PrismaDemoPortfolio } from './infrastructure/prismaDemoPortfolio';
import { PrismaSnapshotRepository } from './infrastructure/prismaSnapshotRepository';
import { PrismaGuestAccounts } from './infrastructure/prismaGuestAccounts';
import { PrismaJobLock } from './infrastructure/prismaJobLock';
import { PrismaPasskeyStore } from './infrastructure/prismaPasskeyStore';
import { scheduleGuestSweep } from './infrastructure/guestSweepSchedule';
import { scheduleBenchmarkRefresh } from './infrastructure/benchmarks/refreshSchedule';
import { createPortfolioService, createPrismaPortfolioDeps } from './infrastructure/prismaPortfolioDeps';
import { PrismaPortfolioRepository } from './infrastructure/prismaPortfolioRepository';
import { scheduleSnapshots } from './infrastructure/snapshotSchedule';
import { SnapshotJob } from './application/snapshotJob';
import { createAdminAnalyticsRouter } from './routes/adminAnalytics';
import { createAppConfigRouter } from './routes/appConfig';
import { createAuthRouter } from './routes/auth';
import { createDemoRouter, createDisabledDemoRouter } from './routes/demo';
import { apiErrorHandler, apiNotFound, JSON_BODY_LIMIT } from './routes/fallbacks';
import { guestGate } from './routes/guestGate';
import { createHealthRouter } from './routes/health';
import { createMarketRouter } from './routes/market';
import { createPortfolioRouter } from './routes/portfolio';
import { mountProfileFeature } from './routes/profileFeature';
import { requestLogger } from './routes/requestLogger';
import { calendarDateOf } from './contracts';

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
app.use('/api', createAppConfigRouter({ demoEnabled: config.enableDemo, captchaSiteKey: config.hcaptcha?.siteKey ?? null }));

// A demo guest's session is only as good as the guest's account: erased (signed out, or the hour is over) means the token stops working at once.
const guestAccounts = new PrismaGuestAccounts(db);
app.use('/api', guestGate((userId) => guestAccounts.isLive(userId, new Date())));

// Profile, living phases and fixed costs (field-level encrypted; see routes/profileFeature.ts).
const { benchmarkRefresher, profileServices } = mountProfileFeature(app, {
  env: { NODE_ENV: config.nodeEnv, PROFILE_ENCRYPTION_KEY: config.profileEncryptionKey },
  prisma: db,
});

// The original portfolio endpoints; every one acts for the bearer-token holder only.
const portfolio = createPortfolioService(db);
app.use('/api', createPortfolioRouter(createPrismaPortfolioDeps(db, portfolio)));

// The administrator is whoever Google confirms to own an email listed in ADMIN_EMAILS; nobody else, and never through a passkey.
const admins = new AdminIdentities(config.adminEmails, hashUserIdentity);
const users = new PrismaUserRepository(db);

// Passwordless sign-in: Google creates and opens accounts, a passkey is added afterwards by someone signed in. No password, and no email, is ever stored.
const auth = new AuthService({
  users,
  // Without GOOGLE_CLIENT_ID the server still starts (the demo and passkeys already added work) but refuses every Google sign-in.
  googleIdentities: new GoogleIdentityVerifier(new OAuth2Client(), config.googleClientId),
  passkeys: createPasskeyAuthenticator({ site: { rpId: config.rpId, origin: config.origin }, store: new PrismaPasskeyStore(db) }),
  hashIdentity: hashUserIdentity,
  issueToken: generateToken,
  admins,
  allowRegistration: config.allowRegistration,
  now: () => new Date(),
});
// The human check before the two ways of creating an account (Google, the demo): only where hCaptcha is configured.
const captcha = config.hcaptcha ? new HCaptchaVerifier(config.hcaptcha.secret, config.hcaptcha.siteKey) : undefined;
const signInAttempts = new SlidingWindowRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000, now: Date.now });
app.use('/api', createAuthRouter(auth, { limiter: signInAttempts, captcha }));

// How many customers use the app: the administrator only.
app.use('/api', createAdminAnalyticsRouter(new UsageAnalyticsService({ users, admins, statistics: new PrismaUsageStatistics(db), now: () => new Date() })));

// Autocomplete of the instrument being logged.
app.use('/api', createMarketRouter(new MarketSearchService({ tickers: tickerSearch })));

// Guest mode ("Try the demo"): every visit gets an account of its own, erased on sign-out and after an hour. Switched off, it does not exist.
const guests = new GuestService({
  accounts: guestAccounts,
  seeder: new DemoGuestSeeder({
    portfolio: new PrismaDemoPortfolio(db),
    // The demo's value history is illustrative and ends at today's prices; a guest never waits more than this for them.
    history: { snapshots: new PrismaSnapshotRepository(db), prices: marketPrices, eurValue: REFERENCE_EUR_RATES, priceTimeoutMs: 2500 },
    profile: profileServices,
    today: () => calendarDateOf(new Date()),
  }),
  issueToken: generateToken,
  now: () => new Date(),
});
app.use('/api', config.enableDemo ? createDemoRouter(guests, { limiter: signInAttempts, captcha }) : createDisabledDemoRouter());

app.use('/api', apiNotFound);
app.use(apiErrorHandler(log));

const stoppers: Array<() => void> = [];

const server = app.listen(config.port, () => {
  log.info('server_started', { port: config.port, env: config.nodeEnv, registration: config.allowRegistration ? 'open' : 'closed', demo: config.enableDemo, captcha: config.hcaptcha ? 'on' : 'off' });
  void prepare();
});

/** Work that must not hold up answering: the inflation history (the demo's portfolio reads it) and the sweep of expired demo accounts. */
async function prepare(): Promise<void> {
  // Runs even with the demo switched off: it also erases the shared guest account that earlier versions left behind.
  const guestSweep = { sweep: () => new PrismaJobLock(db).runExclusive('guest-sweep', async () => void (await guests.sweep())) };
  stoppers.push(scheduleGuestSweep(guestSweep));
  try {
    await syncCountryInflationHistory('Spain');
  } catch (error) {
    log.error('startup_tasks_failed', { error: errorName(error) });
  }
  if (benchmarkRefresher && config.benchmarkRefresh) stoppers.push(scheduleBenchmarkRefresh(benchmarkRefresher));
  // The daily reading of every portfolio (readings are also filed when the figures are read, so a new account does not wait for it).
  stoppers.push(
    scheduleSnapshots(
      new SnapshotJob({
        repository: new PrismaPortfolioRepository(db),
        capture: (userId) => portfolio.captureSnapshot(userId),
        lock: new PrismaJobLock(db),
        onFailure: (error) => log.error('snapshot_failed', { error: errorName(error) }),
      })
    )
  );
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
