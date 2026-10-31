// Must stay the first import: it loads apps/api/.env before any other module reads process.env.
import 'dotenv/config';
import express, { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { db } from './lib/db';
import { syncCountryInflationHistory } from './lib/inflationService';
import { hashUserIdentity } from './lib/privacy';
import { assertJwtSecretConfigured, generateToken } from './lib/auth';
import { getPasskeyOptions, verifyPasskeyCredential } from './lib/passkey';
import { searchMarketTickers } from './lib/financialFetcher';
import { ensureDemoUserWithData } from './lib/demoSeed';
import { mountProfileFeature } from './routes/profileFeature';
import { scheduleBenchmarkRefresh } from './infrastructure/benchmarks/refreshSchedule';
import { createPortfolioRouter } from './routes/portfolio';
import { createPrismaPortfolioDeps } from './infrastructure/prismaPortfolioDeps';

assertJwtSecretConfigured();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app = express();
app.use(express.json());

// Profile, living phases and fixed costs (field-level encrypted; see routes/profileFeature.ts).
const { benchmarkRefresher } = mountProfileFeature(app, { env: process.env, prisma: db });

// The original portfolio endpoints; every one acts for the bearer-token holder only.
app.use('/api', createPortfolioRouter(createPrismaPortfolioDeps(db)));

const PORT = process.env.PORT || 3000;

async function seedAdmin() {
  try {
    await ensureDemoUserWithData();
    await syncCountryInflationHistory('Spain');
  } catch (error) {
    console.error('Error seeding demo user:', error);
  }
}

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// GET /api/market/search - Autocomplete ticker search (requires 3+ chars)
app.get('/api/market/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    if (q.trim().length < 3) {
      return res.json([]);
    }
    const results = await searchMarketTickers(q);
    return res.json(results);
  } catch (error) {
    console.error('Market search error:', error);
    return res.status(500).json({ error: 'Market search failed.' });
  }
});

// PASSWORDLESS AUTHENTICATION ROUTES (Google OAuth & Passkey)

// POST /api/auth/google - Authenticate or register user via Google OAuth
app.post('/api/auth/google', async (req: Request, res: Response) => {
  try {
    let { credential, idToken, email, name, googleId, avatarUrl } = req.body;

    const tokenToVerify = credential || idToken;

    if (tokenToVerify) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: tokenToVerify,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (payload) {
          email = payload.email;
          name = payload.name;
          googleId = payload.sub;
          avatarUrl = payload.picture;
        }
      } catch (verifyErr) {
        console.error('Failed to verify Google ID token:', verifyErr);
        return res.status(401).json({ error: 'Invalid Google authentication token.' });
      }
    }

    if (!email && !googleId) {
      return res.status(400).json({ error: 'Google authentication requires valid email or Google ID.' });
    }

    const rawId = email || googleId;
    const userHash = hashUserIdentity(rawId);

    let user = await db.user.findUnique({
      where: { userHash },
    });

    if (!user) {
      user = await db.user.create({
        data: {
          userHash,
          country: 'Spain',
          baseCurrency: 'EUR',
          annualInflationRate: 2.8,
        },
      });
      console.log(`🔒 Anonymous pseudonymous user account created in DB (Hash: ${userHash.slice(0, 10)}...)`);
    }

    const token = generateToken(user.id);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: email || 'user@privacy.local',
        name: name || 'Privacy User',
        avatarUrl,
        country: user.country,
      },
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    return res.status(500).json({ error: 'Internal server error during Google Sign-In.' });
  }
});

// POST /api/auth/passkey/generate-options - Generate WebAuthn registration/authentication options
app.post('/api/auth/passkey/generate-options', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required to generate Passkey options.' });
    }
    const data = await getPasskeyOptions(email);
    return res.json(data);
  } catch (error) {
    console.error('Passkey options error:', error);
    return res.status(500).json({ error: 'Failed to generate Passkey challenge.' });
  }
});

// POST /api/auth/passkey/verify - Verify biometric TouchID / FaceID passkey credential
app.post('/api/auth/passkey/verify', async (req: Request, res: Response) => {
  try {
    const { email, credential } = req.body;
    if (!email || !credential) {
      return res.status(400).json({ error: 'Email and Passkey credential required.' });
    }

    const user = await verifyPasskeyCredential(email, credential);
    const token = generateToken(user.id);

    const emailPrefix = email.split('@')[0];
    const formattedName = (emailPrefix.toLowerCase() === 'user' || emailPrefix.toLowerCase() === 'passkey')
      ? 'Investor'
      : emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email,
        name: formattedName,
        country: user.country,
      },
    });
  } catch (error: any) {
    console.error('Passkey Verification Error:', error);
    return res.status(400).json({ error: error.message || 'Passkey verification failed.' });
  }
});

// POST /api/auth/demo - Sneak peek demo account login
app.post('/api/auth/demo', async (req: Request, res: Response) => {
  try {
    const demoUser = await ensureDemoUserWithData();
    const token = generateToken(demoUser.id);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: demoUser.id,
        email: demoUser.email || 'demo@portfolio.local',
        name: 'Joe',
        avatarUrl: demoUser.avatarUrl,
        country: demoUser.country,
      },
    });
  } catch (error) {
    console.error('Demo Auth Error:', error);
    return res.status(500).json({ error: 'Failed to initialize demo portfolio.' });
  }
});

app.listen(PORT, async () => {
  await seedAdmin();
  if (benchmarkRefresher && process.env.BENCHMARK_REFRESH !== 'off') scheduleBenchmarkRefresh(benchmarkRefresher);
  console.log(`🚀 Portfolio-Tracker Backend running on port ${PORT}`);
});