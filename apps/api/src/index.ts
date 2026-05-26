import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { prisma } from './lib/db';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

app.post('/api/transactions', async (req: Request, res: Response) => {
    try {
        const { ticker, name, instrumentType, type, cashAmount } = req.body;

        if (!ticker || !instrumentType || !type || !cashAmount) {
            return res.status(400).json({ error: 'Missing required transaction fields.' });
        }

        const asset = await prisma.asset.upsert({
            where: { ticker },
            update: {},
            create: {
                ticker,
                isin: `TEMP-${ticker}`, // Temporary placeholder string for the MVP
                name: name || ticker,
                currentPrice: 1.0,     // Base baseline, to be wired to a live ticker feed later
                currency: 'EUR',
                allocations: {
                    create: {
                        instrumentType,     // e.g., 'ETF' or 'Stock'
                        percentage: 100.0
                    }
                }
            }
        });

        const position = await prisma.position.create({
            data: {
                assetId: asset.id,
                quantity: type === 'BUY' ? cashAmount : -cashAmount, // Tracking raw cash value flows
                avgPrice: 1.0
            }
        });

        return res.status(201).json({
            success: true,
            message: `Successfully recorded ${type} order for ${ticker}`,
            data: position
        });
    } catch (error) {
        console.error('Transaction processing error:', error);
        return res.status(500).json({ error: 'Internal server error processing transaction.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Portfolio-Tracker Backend running on port ${PORT}`);
});