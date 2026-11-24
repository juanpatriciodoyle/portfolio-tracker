import express from 'express';
import request from 'supertest';
import { generateToken } from '../lib/auth';
import { ResourceNotFoundError } from '../application/errors';
import { InsufficientCashError, InsufficientHoldingsError, TransactionRequiredByLaterError } from '../domain/errors';
import { createPortfolioRouter, type PortfolioRouterDeps } from '../routes/portfolio';

const ALICE = 'user-alice';
const BOB = 'user-bob';

function build(overrides: Partial<PortfolioRouterDeps> = {}) {
  const calls: Array<{ action: string; userId: string; input?: unknown }> = [];
  const record = (action: string, result: unknown) => async (userId: string, input?: unknown) => {
    calls.push({ action, userId, input });
    return result;
  };
  const deps: PortfolioRouterDeps = {
    overview: record('overview', { totalValue: 1 }),
    history: record('history', []),
    listTransactions: record('transactions', []),
    recordTransaction: async (params) => {
      calls.push({ action: 'record', userId: params.userId, input: params });
      return { id: 't1' };
    },
    updateTransaction: async (command) => {
      calls.push({ action: 'updateTransaction', userId: command.userId, input: command });
    },
    deleteTransaction: async (command) => {
      calls.push({ action: 'deleteTransaction', userId: command.userId, input: command });
    },
    getSettings: async (userId) => {
      calls.push({ action: 'getSettings', userId });
      return { country: 'Spain', baseCurrency: 'EUR', annualInflationRate: 2.8, cashBalance: 0 };
    },
    updateSettings: async (userId, input) => {
      calls.push({ action: 'updateSettings', userId, input });
      return { country: 'Spain', baseCurrency: 'EUR', annualInflationRate: 3 };
    },
    syncInflation: async (country) => {
      calls.push({ action: 'sync', userId: '', input: country });
      return 2.8;
    },
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use('/api', createPortfolioRouter(deps));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  return { app, calls, deps };
}

const bearer = (userId: string) => `Bearer ${generateToken(userId)}`;

const GUARDED_READS = [
  '/api/portfolio/stats',
  '/api/portfolio/history',
  '/api/transactions',
  '/api/user/config',
];

describe('legacy portfolio routes: who is asking comes from the signed token only', () => {
  it.each(GUARDED_READS)('%s refuses a request without a token', async (path) => {
    const { app, calls } = build();

    const response = await request(app).get(path);

    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it.each(GUARDED_READS)('%s refuses a forged token', async (path) => {
    const { app, calls } = build();

    const response = await request(app).get(path).set('Authorization', 'Bearer not-a-token');

    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it.each(GUARDED_READS)('%s ignores ?userId= and a token in the URL', async (path) => {
    const { app, calls } = build();

    const spoofed = await request(app).get(`${path}?userId=${BOB}`).set('Authorization', bearer(ALICE));
    const tokenInUrl = await request(app).get(`${path}?token=${generateToken(ALICE)}`);

    expect(spoofed.status).toBe(200);
    expect(calls.map((call) => call.userId)).toEqual([ALICE]);
    expect(tokenInUrl.status).toBe(401);
  });

  it('never answers with a fallback user when there is no token', async () => {
    const { app, calls } = build();

    await request(app).get('/api/portfolio/stats?userId=');

    expect(calls).toEqual([]);
  });

  it('keeps portfolio answers out of caches', async () => {
    const { app } = build();

    const response = await request(app).get('/api/portfolio/stats').set('Authorization', bearer(ALICE));

    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('leaves unrelated routes alone', async () => {
    const { app } = build();

    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});

describe('recording a transaction', () => {
  const body = { type: 'BOUGHT', symbol: 'aapl', amount: '150.5', quantity: 2, currency: 'USD' };

  it('records it for the token holder, whatever userId the body claims', async () => {
    const { app, calls } = build();

    const response = await request(app).post('/api/transactions').set('Authorization', bearer(ALICE)).send({ ...body, userId: BOB });

    expect(response.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ action: 'record', userId: ALICE, input: { symbol: 'AAPL', amount: 150.5, quantity: 2, currency: 'USD' } });
  });

  it('brings new money by default: a buy is not paid with cash unless it says so', async () => {
    const { app, calls } = build();

    await request(app).post('/api/transactions').set('Authorization', bearer(ALICE)).send(body);
    await request(app).post('/api/transactions').set('Authorization', bearer(ALICE)).send({ ...body, paidWithCash: true });

    expect(calls[0].input).toMatchObject({ paidWithCash: false });
    expect(calls[1].input).toMatchObject({ paidWithCash: true });
  });

  it('refuses it without a token', async () => {
    const { app, calls } = build();

    expect((await request(app).post('/api/transactions').send(body)).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('rejects a malformed body at the boundary', async () => {
    const { app, calls } = build();

    for (const bad of [{}, { type: 'GIFT', amount: 1 }, { type: 'BOUGHT', amount: 'lots' }, { type: 'BOUGHT', amount: 1, date: 'someday' }, { type: 'BOUGHT', amount: 1, paidWithCash: 'yes' }]) {
      const response = await request(app).post('/api/transactions').set('Authorization', bearer(ALICE)).send(bad);
      expect(response.status).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});

describe('user settings', () => {
  it('updates the token holder, never the userId in the body', async () => {
    const { app, calls } = build();

    const response = await request(app)
      .post('/api/user/config')
      .set('Authorization', bearer(ALICE))
      .send({ country: 'Argentina', annualInflationRate: '3', userId: BOB });

    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ action: 'updateSettings', userId: ALICE, input: { country: 'Argentina', annualInflationRate: 3 } });
  });

  it('answers 404 when the account no longer exists', async () => {
    const { deps } = build();
    const app = express();
    app.use('/api', createPortfolioRouter({ ...deps, getSettings: async () => null }));

    const response = await request(app).get('/api/user/config').set('Authorization', bearer(ALICE));

    expect(response.status).toBe(404);
  });

  it('only a signed-in user can trigger an inflation sync', async () => {
    const { app, calls } = build();

    expect((await request(app).post('/api/user/sync-inflation').send({ country: 'Spain' })).status).toBe(401);
    expect(calls).toEqual([]);
    expect((await request(app).post('/api/user/sync-inflation').set('Authorization', bearer(ALICE)).send({ country: 'Spain' })).status).toBe(200);
  });
});

describe('POST /api/transactions: selling what is not held', () => {
  it('answers 400 with the units available when the sale is refused', async () => {
    const { app } = build({
      recordTransaction: async () => {
        throw new InsufficientHoldingsError('AAPL', 20, 11);
      },
    });

    const response = await request(app)
      .post('/api/transactions')
      .set('Authorization', bearer(ALICE))
      .send({ type: 'SOLD', symbol: 'aapl', quantity: 20, amount: 100 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'INSUFFICIENT_HOLDINGS', availableUnits: 11 });
  });
});

describe('POST /api/transactions: paying with cash that is not there', () => {
  it('answers 400 with the cash available, in cents, when the purchase is refused', async () => {
    const { app } = build({
      recordTransaction: async () => {
        throw new InsufficientCashError('EUR', 1800, 250.5);
      },
    });

    const response = await request(app)
      .post('/api/transactions')
      .set('Authorization', bearer(ALICE))
      .send({ type: 'BOUGHT', symbol: 'aapl', quantity: 10, amount: 1800, paidWithCash: true });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'INSUFFICIENT_CASH', currency: 'EUR', availableMinor: 25050 });
    expect(typeof response.body.error).toBe('string');
  });
});

describe('correcting and removing a transaction', () => {
  it('corrects it for the token holder, whatever userId the body claims, and answers with no content', async () => {
    const { app, calls } = build();

    const response = await request(app)
      .patch('/api/transactions/t1')
      .set('Authorization', bearer(ALICE))
      .send({ amount: '1200.5', quantity: 12, fee: 0, paidWithCash: true, notes: 'fixed', date: '2026-02-01', userId: BOB, symbol: 'MSFT', type: 'SOLD' });

    expect(response.status).toBe(204);
    expect(calls).toEqual([
      { action: 'updateTransaction', userId: ALICE, input: { userId: ALICE, id: 't1', change: { amount: 1200.5, quantity: 12, fee: 0, paidWithCash: true, notes: 'fixed', date: '2026-02-01' } } },
    ]);
  });

  it('never lets what was traded or its kind be changed through the body', async () => {
    const { app, calls } = build();

    await request(app).patch('/api/transactions/t1').set('Authorization', bearer(ALICE)).send({ fee: 2, symbol: 'MSFT', type: 'SOLD', currency: 'USD' });

    expect(calls[0].input).toEqual({ userId: ALICE, id: 't1', change: { fee: 2 } });
  });

  it('removes it for the token holder only', async () => {
    const { app, calls } = build();

    const response = await request(app).delete('/api/transactions/t1?userId=' + BOB).set('Authorization', bearer(ALICE));

    expect(response.status).toBe(204);
    expect(calls).toEqual([{ action: 'deleteTransaction', userId: ALICE, input: { userId: ALICE, id: 't1' } }]);
  });

  it('refuses both without a token, and with a forged one', async () => {
    const { app, calls } = build();

    expect((await request(app).patch('/api/transactions/t1').send({ fee: 1 })).status).toBe(401);
    expect((await request(app).delete('/api/transactions/t1')).status).toBe(401);
    expect((await request(app).delete('/api/transactions/t1').set('Authorization', 'Bearer not-a-token')).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('rejects a correction that changes nothing or makes no sense, before it reaches the use case', async () => {
    const { app, calls } = build();

    for (const bad of [{}, { amount: -5 }, { amount: 0 }, { quantity: 0 }, { fee: -1 }, { date: 'someday' }, { paidWithCash: 'yes' }, { amount: 'lots' }]) {
      const response = await request(app).patch('/api/transactions/t1').set('Authorization', bearer(ALICE)).send(bad);
      expect(response.status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it('answers 404 when the person has no such transaction', async () => {
    const { app } = build({
      deleteTransaction: async () => {
        throw new ResourceNotFoundError('Transaction not found');
      },
    });

    expect((await request(app).delete('/api/transactions/nope').set('Authorization', bearer(ALICE))).status).toBe(404);
  });

  it('answers 409 naming the later transaction that depends on this one', async () => {
    const dependent = { id: 't9', type: 'SOLD' as const, symbol: 'AAPL', date: '2026-02-01' };
    const { app } = build({
      deleteTransaction: async () => {
        throw new TransactionRequiredByLaterError(dependent);
      },
    });

    const response = await request(app).delete('/api/transactions/t1').set('Authorization', bearer(ALICE));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'TRANSACTION_REQUIRED_BY_LATER', dependent });
  });

  it('answers a refused correction the same way a refused record does', async () => {
    const { app } = build({
      updateTransaction: async () => {
        throw new InsufficientHoldingsError('AAPL', 12, 10);
      },
    });

    const response = await request(app).patch('/api/transactions/t1').set('Authorization', bearer(ALICE)).send({ quantity: 12 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'INSUFFICIENT_HOLDINGS', availableUnits: 10 });
  });
});
