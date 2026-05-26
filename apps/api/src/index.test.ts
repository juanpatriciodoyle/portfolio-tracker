// 1. Force the correct database URL into the environment before loading dependencies
process.env.DATABASE_URL = "postgresql://postgres:portfolio_secure_password@localhost:5432/portfolio?schema=public";

import request from 'supertest';
import express from 'express';
import { db } from './lib/db';

const app = express();
app.use(express.json());

app.post('/api/transactions', async (req, res) => {
    try {
        const { ticker, unitPrice, industry, regions, instrumentType, type, cashAmount } = req.body;

        const asset = await db.asset.upsert({
            where: { ticker },
            update: {},
            create: {
                ticker,
                isin: `TEMP-${ticker}-${Date.now()}`, // Added timestamp to prevent unique constraint blocks
                name: ticker,
                currentPrice: parseFloat(unitPrice),
                currency: 'EUR',
                industry,
                regions,
                allocations: {
                    create: {
                        instrumentType,
                        percentage: 100.0,
                    },
                },
            },
        });

        res.status(201).json({ success: true, asset });
    } catch (error: any) {
        console.error('\n🚨 REAL DATABASE CRASH CAUSE FOUND:');
        console.error(error);
        console.error('------------------------------------\n');
        res.status(500).json({ error: error.message });
    }
});

describe('POST /api/transactions Bug Elimination Test', () => {
    it('should process a valid transaction submission payload', async () => {
        const payload = {
            ticker: "PRX.NL",
            unitPrice: 35.50,
            industry: "Technology",
            instrumentType: "Stock",
            regions: ["EU"],
            type: "BUY",
            cashAmount: 1000.0
        };

        const response = await request(app)
            .post('/api/transactions')
            .send(payload);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
    });
});