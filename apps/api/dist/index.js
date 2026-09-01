"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const google_auth_library_1 = require("google-auth-library");
const db_1 = require("./lib/db");
const pnlEngine_1 = require("./lib/pnlEngine");
const inflationService_1 = require("./lib/inflationService");
const privacy_1 = require("./lib/privacy");
const auth_1 = require("./lib/auth");
const passkey_1 = require("./lib/passkey");
const financialFetcher_1 = require("./lib/financialFetcher");
const demoSeed_1 = require("./lib/demoSeed");
dotenv_1.default.config();
const googleClient = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = process.env.PORT || 3001;
function getUserIdFromReq(req) {
    if (req.query.userId && typeof req.query.userId === 'string') {
        return req.query.userId;
    }
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = (0, auth_1.verifyToken)(token);
        if (decoded?.userId) {
            return decoded.userId;
        }
    }
    return undefined;
}
async function seedAdmin() {
    try {
        await (0, demoSeed_1.ensureDemoUserWithData)();
        await (0, inflationService_1.syncCountryInflationHistory)('Spain');
    }
    catch (error) {
        console.error('Error seeding demo user:', error);
    }
}
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});
// GET /api/market/search - Autocomplete ticker search (requires 3+ chars)
app.get('/api/market/search', async (req, res) => {
    try {
        const q = req.query.q || '';
        if (q.trim().length < 3) {
            return res.json([]);
        }
        const results = await (0, financialFetcher_1.searchMarketTickers)(q);
        return res.json(results);
    }
    catch (error) {
        console.error('Market search error:', error);
        return res.status(500).json({ error: 'Market search failed.' });
    }
});
// GET /api/portfolio/stats - Return real portfolio statistics for user
app.get('/api/portfolio/stats', async (req, res) => {
    try {
        const userId = getUserIdFromReq(req);
        const overview = await (0, pnlEngine_1.getPortfolioOverview)(userId);
        return res.json(overview);
    }
    catch (error) {
        console.error('Error calculating portfolio stats:', error);
        return res.status(500).json({ error: 'Internal server error calculating portfolio stats.' });
    }
});
// GET /api/portfolio/history - Return real live historical time series for user
app.get('/api/portfolio/history', async (req, res) => {
    try {
        const userId = getUserIdFromReq(req);
        const history = await (0, pnlEngine_1.getPortfolioHistory)(userId);
        return res.json(history);
    }
    catch (error) {
        console.error('Error calculating portfolio history:', error);
        return res.status(500).json({ error: 'Internal server error calculating portfolio history.' });
    }
});
// GET /api/portfolio/performance-periods - Return monthly and annual returns for bar chart & heatmap
app.get('/api/portfolio/performance-periods', async (req, res) => {
    try {
        const userId = getUserIdFromReq(req);
        const periods = await (0, pnlEngine_1.getPortfolioPerformancePeriods)(userId);
        return res.json(periods);
    }
    catch (error) {
        console.error('Error calculating performance periods:', error);
        return res.status(500).json({ error: 'Internal server error calculating performance periods.' });
    }
});
// GET /api/transactions - Return logged transaction history for user
app.get('/api/transactions', async (req, res) => {
    try {
        const userId = getUserIdFromReq(req);
        let targetUserId = userId;
        if (!targetUserId) {
            const admin = await db_1.db.user.findFirst();
            if (admin)
                targetUserId = admin.id;
        }
        const transactions = await db_1.db.transaction.findMany({
            where: targetUserId ? { userId: targetUserId } : {},
            orderBy: { date: 'desc' },
        });
        return res.json(transactions);
    }
    catch (error) {
        console.error('Error fetching transaction logs:', error);
        return res.status(500).json({ error: 'Internal server error fetching transactions.' });
    }
});
// POST /api/transactions - Process BOUGHT, SOLD, DEPOSIT, WITHDRAWAL
app.post('/api/transactions', async (req, res) => {
    try {
        const { type, symbol, name, assetClass, region, sector, quantity, amount, fee, currency, notes, date, userId, } = req.body;
        if (!type || amount === undefined || isNaN(parseFloat(amount))) {
            return res.status(400).json({ error: 'Missing required transaction fields (type, amount).' });
        }
        let targetUserId = userId;
        if (!targetUserId) {
            const admin = await db_1.db.user.findFirst();
            if (admin)
                targetUserId = admin.id;
        }
        const parsedAmount = parseFloat(amount);
        const parsedFee = fee ? parseFloat(fee) : 0;
        const parsedQuantity = quantity ? parseFloat(quantity) : 1.0;
        const result = await (0, pnlEngine_1.processTransaction)({
            userId: targetUserId,
            type,
            symbol: symbol ? symbol.toUpperCase() : type,
            name,
            assetClass,
            region,
            sector,
            quantity: parsedQuantity,
            amount: parsedAmount,
            fee: parsedFee,
            currency: currency || 'EUR',
            notes,
            date,
        });
        return res.status(201).json({
            success: true,
            message: `Recorded ${type} order for ${symbol || type}`,
            transaction: result,
        });
    }
    catch (error) {
        console.error('Core transaction processing failure details:', error);
        return res.status(500).json({ error: 'Internal server error processing transaction.' });
    }
});
// GET /api/user/config - Fetch user settings
app.get('/api/user/config', async (req, res) => {
    try {
        const userId = req.query.userId || undefined;
        const admin = userId
            ? await db_1.db.user.findUnique({ where: { id: userId } })
            : await db_1.db.user.findFirst();
        if (!admin) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json({
            country: admin.country,
            baseCurrency: admin.baseCurrency,
            annualInflationRate: admin.annualInflationRate,
            cashBalance: admin.cashBalance,
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'Internal server error fetching user config.' });
    }
});
// POST /api/user/config - Update user settings
app.post('/api/user/config', async (req, res) => {
    try {
        const { country, baseCurrency, annualInflationRate, userId } = req.body;
        let targetUserId = userId;
        if (!targetUserId) {
            const admin = await db_1.db.user.findFirst();
            if (admin)
                targetUserId = admin.id;
        }
        const updated = await db_1.db.user.update({
            where: { id: targetUserId },
            data: {
                country: country || undefined,
                baseCurrency: baseCurrency || undefined,
                annualInflationRate: annualInflationRate !== undefined ? parseFloat(annualInflationRate) : undefined,
            },
        });
        return res.json({
            success: true,
            config: {
                country: updated.country,
                baseCurrency: updated.baseCurrency,
                annualInflationRate: updated.annualInflationRate,
            },
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'Internal server error updating user config.' });
    }
});
// POST /api/user/sync-inflation - Re-fetch annual inflation rate history
app.post('/api/user/sync-inflation', async (req, res) => {
    try {
        const { country = 'Spain' } = req.body || {};
        const rates = await (0, inflationService_1.syncCountryInflationHistory)(country);
        return res.json({ success: true, country, annualInflationRate: rates[new Date().getFullYear() - 1] || 2.8 });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to sync inflation rate.' });
    }
});
// PASSWORDLESS AUTHENTICATION ROUTES (Google OAuth & Passkey)
// POST /api/auth/google - Authenticate or register user via Google OAuth
app.post('/api/auth/google', async (req, res) => {
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
            }
            catch (verifyErr) {
                console.error('Failed to verify Google ID token:', verifyErr);
                return res.status(401).json({ error: 'Invalid Google authentication token.' });
            }
        }
        if (!email && !googleId) {
            return res.status(400).json({ error: 'Google authentication requires valid email or Google ID.' });
        }
        const rawId = email || googleId;
        const userHash = (0, privacy_1.hashUserIdentity)(rawId);
        let user = await db_1.db.user.findUnique({
            where: { userHash },
        });
        if (!user) {
            user = await db_1.db.user.create({
                data: {
                    userHash,
                    country: 'Spain',
                    baseCurrency: 'EUR',
                    annualInflationRate: 2.8,
                },
            });
            console.log(`🔒 Anonymous pseudonymous user account created in DB (Hash: ${userHash.slice(0, 10)}...)`);
        }
        const token = (0, auth_1.generateToken)(user.id);
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
    }
    catch (error) {
        console.error('Google Auth Error:', error);
        return res.status(500).json({ error: 'Internal server error during Google Sign-In.' });
    }
});
// POST /api/auth/passkey/generate-options - Generate WebAuthn registration/authentication options
app.post('/api/auth/passkey/generate-options', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email required to generate Passkey options.' });
        }
        const data = await (0, passkey_1.getPasskeyOptions)(email);
        return res.json(data);
    }
    catch (error) {
        console.error('Passkey options error:', error);
        return res.status(500).json({ error: 'Failed to generate Passkey challenge.' });
    }
});
// POST /api/auth/passkey/verify - Verify biometric TouchID / FaceID passkey credential
app.post('/api/auth/passkey/verify', async (req, res) => {
    try {
        const { email, credential } = req.body;
        if (!email || !credential) {
            return res.status(400).json({ error: 'Email and Passkey credential required.' });
        }
        const user = await (0, passkey_1.verifyPasskeyCredential)(email, credential);
        const token = (0, auth_1.generateToken)(user.id);
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
    }
    catch (error) {
        console.error('Passkey Verification Error:', error);
        return res.status(400).json({ error: error.message || 'Passkey verification failed.' });
    }
});
// POST /api/auth/demo - Sneak peek demo account login
app.post('/api/auth/demo', async (req, res) => {
    try {
        const demoUser = await (0, demoSeed_1.ensureDemoUserWithData)();
        const token = (0, auth_1.generateToken)(demoUser.id);
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
    }
    catch (error) {
        console.error('Demo Auth Error:', error);
        return res.status(500).json({ error: 'Failed to initialize demo portfolio.' });
    }
});
app.listen(PORT, async () => {
    await seedAdmin();
    console.log(`🚀 Portfolio-Tracker Backend running on port ${PORT}`);
});
