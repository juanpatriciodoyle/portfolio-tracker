// Must stay the first import: it loads apps/api/.env before any other module reads process.env.
import 'dotenv/config';
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { db } from './lib/db';
import { syncCountryInflationHistory } from './lib/inflationService';
import { hashUserIdentity } from './lib/privacy';
import { assertJwtSecretConfigured, generateToken } from './lib/auth';
import { tickerSearch } from './lib/financialFetcher';
import { ensureDemoUserWithData, isDemoUserId, resetDemoUser } from './lib/demoSeed';
import { AuthService } from './application/authService';
import { SlidingWindowRateLimiter } from './application/limits';
import { MarketSearchService } from './application/marketSearchService';
import { GoogleIdentityVerifier } from './infrastructure/googleIdentityVerifier';
import { PrismaUserRepository } from './infrastructure/prismaUserRepository';
import { passkeyAuthenticator } from './infrastructure/simpleWebAuthnPasskeys';
import { createAuthRouter } from './routes/auth';
import { createDemoRouter } from './routes/demo';
import { createMarketRouter } from './routes/market';
import { mountProfileFeature } from './routes/profileFeature';
import { scheduleBenchmarkRefresh } from './infrastructure/benchmarks/refreshSchedule';
import { createPortfolioRouter } from './routes/portfolio';
import { createPrismaPortfolioDeps } from './infrastructure/prismaPortfolioDeps';

assertJwtSecretConfigured();

const app = express();
app.use(express.json());

// Profile, living phases and fixed costs (field-level encrypted; see routes/profileFeature.ts).
const { benchmarkRefresher } = mountProfileFeature(app, { env: process.env, prisma: db });

// The original portfolio endpoints; every one acts for the bearer-token holder only.
app.use('/api', createPortfolioRouter(createPrismaPortfolioDeps(db)));

// Passwordless sign-in (Google and passkeys): no password, and no email, is ever stored.
const auth = new AuthService({
  users: new PrismaUserRepository(db),
  // Without GOOGLE_CLIENT_ID the server still starts (passkeys and the demo work) but refuses every Google sign-in.
  googleIdentities: new GoogleIdentityVerifier(new OAuth2Client(), process.env.GOOGLE_CLIENT_ID),
  passkeys: passkeyAuthenticator,
  hashIdentity: hashUserIdentity,
  issueToken: generateToken,
});
const signInAttempts = new SlidingWindowRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000, now: Date.now });
app.use('/api', createAuthRouter(auth, { limiter: signInAttempts }));

// Autocomplete of the instrument being logged.
app.use('/api', createMarketRouter(new MarketSearchService({ tickers: tickerSearch })));

// Guest mode ("Sneak peek" as Joe): ephemeral, wiped on sign-out and before every new guest session.
app.use('/api', createDemoRouter({ restore: resetDemoUser, isGuestAccount: isDemoUserId }));

const PORT = process.env.PORT || 3000;

async function seedAdmin() {
  try {
    await ensureDemoUserWithData();
    await syncCountryInflationHistory('Spain');
  } catch (error) {
    console.error('Error seeding demo user:', error);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.listen(PORT, async () => {
  await seedAdmin();
  if (benchmarkRefresher && process.env.BENCHMARK_REFRESH !== 'off') scheduleBenchmarkRefresh(benchmarkRefresher);
  console.log(`🚀 Portfolio-Tracker Backend running on port ${PORT}`);
});