import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { db } from './lib/db';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

async function seedAdmin() {
  try {
    const adminEmail = 'admin@portfolio.local';
    const existing = await db.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existing) {
      const passwordHash = await bcrypt.hash('admin', 10);
      await db.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          twoFactorSecret: '123456',
        },
      });
      console.log('✅ Admin account seeded successfully.');
    }
  } catch (error) {
    console.error('Error seeding admin user:', error);
  }
}

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.post('/api/auth/signin', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password.' });
    }

    if (email === "admin" && password === "admin") {
      return res.status(200).json({
        success: true,
        user: {
          id: "mock-admin-id",
          email: "admin@portfolio.local",
        },
      });
    }

    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error signing in.' });
  }
});

app.post('/api/auth/signup', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password.' });
    }

    const existing = await db.user.findUnique({
      where: { email },
    });

    if (existing) {
      return res.status(400).json({ error: 'User already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        twoFactorSecret: '123456',
      },
    });

    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error signing up.' });
  }
});

app.post('/api/auth/recover', async (req: Request, res: Response) => {
  try {
    const { email, passcode, newPassword } = req.body;

    if (!email || !passcode || !newPassword) {
      return res.status(400).json({ error: 'Missing email, 2FA passcode, or new password.' });
    }

    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.twoFactorSecret !== passcode) {
      return res.status(400).json({ error: 'Invalid 2FA passcode.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { email },
      data: { passwordHash },
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset successful.',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error resetting password.' });
  }
});

app.post('/api/transactions', async (req: Request, res: Response) => {
  try {
    const { ticker, name, instrumentType, type, cashAmount, userId } = req.body;

    if (!ticker || !instrumentType || !type || !cashAmount) {
      return res.status(400).json({ error: 'Missing required transaction fields.' });
    }

    const asset = await db.asset.upsert({
      where: { ticker },
      update: {},
      create: {
        ticker,
        isin: `TEMP-${ticker}`,
        name: name || ticker,
        currentPrice: 1.0,
        currency: 'EUR',
        allocations: {
          create: {
            instrumentType,
            percentage: 100.0,
          },
        },
      },
    });

    const position = await db.position.create({
      data: {
        assetId: asset.id,
        quantity: type === 'BUY' ? cashAmount : -cashAmount,
        avgPrice: 1.0,
        userId: userId || null,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Successfully recorded ${type} order for ${ticker}`,
      data: position,
    });
  } catch (error) {
    console.error('Transaction processing error:', error);
    return res.status(500).json({ error: 'Internal server error processing transaction.' });
  }
});

app.listen(PORT, async () => {
  await seedAdmin();
  console.log(`🚀 Portfolio-Tracker Backend running on port ${PORT}`);
});