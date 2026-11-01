import { salary } from './support/income';
import express from 'express';
import request from 'supertest';
import type { PortfolioValueReader } from '../application/ports';
import { secondSalaryResponse } from '../contracts';
import { generateToken } from '../lib/auth';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { buildProfileFeature } from '../routes/profileFeature';
import { InMemoryBillingRecordRepository, InMemoryLivingPhaseRepository, InMemoryProfileRepository } from './support/inMemoryRepositories';

function build(portfolio: PortfolioValueReader) {
  const livingPhaseRepository = new InMemoryLivingPhaseRepository();
  let ids = 0;
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    ...buildProfileFeature({
      cipher: new AesGcmFieldCipher(Buffer.alloc(32, 4)),
      fingerprinter: new HmacBillFingerprinter(Buffer.alloc(32, 4)),
      livingPhaseRepository,
      profileRepository: new InMemoryProfileRepository(),
      billingRecordRepository: new InMemoryBillingRecordRepository(livingPhaseRepository),
      portfolio,
      today: () => '2026-10-31',
      newId: () => `id-${++ids}`,
    })
  );
  return app;
}

const worth = (amountMinor: number, currency = 'EUR'): PortfolioValueReader => ({ netWorth: async () => ({ amountMinor, currency }) });

const ALICE = { Authorization: `Bearer ${generateToken('alice')}` };
const madrid = {
  name: 'Madrid',
  city: 'Madrid',
  countryCode: 'ES',
  tenure: 'RENT',
  startDate: '2022-09-01',
  currency: 'EUR',
  incomeStreams: salary(320000),
  fixedCosts: [
    { category: 'RENT', cadence: 'MONTHLY', amountMinor: 90000 },
    { category: 'ELECTRICITY', cadence: 'MONTHLY', amountMinor: 8000 },
    { category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', amountMinor: 22000 },
    { category: 'OTHER', cadence: 'MONTHLY', amountMinor: 30000 },
  ],
};

describe('GET /api/insights/second-salary', () => {
  it('needs a token, ignores one in the URL, and is never cached', async () => {
    const app = build(worth(0));

    expect((await request(app).get('/api/insights/second-salary')).status).toBe(401);
    expect((await request(app).get(`/api/insights/second-salary?token=${generateToken('alice')}`)).status).toBe(401);
    expect((await request(app).get('/api/insights/second-salary').set(ALICE)).headers['cache-control']).toBe('no-store');
  });

  it('turns the portfolio into a monthly salary and measures it against the phase being lived', async () => {
    const app = build(worth(200_000_00)); // €200,000 -> €1,000 / month
    await request(app).post('/api/living-phases').set(ALICE).send(madrid);

    const response = await request(app).get('/api/insights/second-salary').set(ALICE);

    expect(response.status).toBe(200);
    const parsed = secondSalaryResponse.parse(response.body);
    expect(parsed).toMatchObject({ currency: 'EUR', secondSalaryMinor: 100_000, gap: null, reachedMilestone: 2 });
    expect(parsed.milestones.map(({ id, monthlyCostMinor, reached }) => ({ id, monthlyCostMinor, reached }))).toEqual([
      { id: 1, monthlyCostMinor: 30_000, reached: true },
      { id: 2, monthlyCostMinor: 90_000, reached: true },
      { id: 3, monthlyCostMinor: 150_000, reached: false },
    ]);
    expect(parsed.target).toMatchObject({ minMonthlyMinor: 300_000, maxMonthlyMinor: 500_000, reachedMin: false });
  });

  it('still shows the salary, with the reason, when no cost can be compared', async () => {
    const empty = await request(build(worth(100_000_00))).get('/api/insights/second-salary').set(ALICE);
    expect(empty.body).toMatchObject({ secondSalaryMinor: 50_000, milestones: [], gap: 'NO_CURRENT_PHASE' });

    const dollars = build(worth(100_000_00, 'USD'));
    await request(dollars).post('/api/living-phases').set(ALICE).send(madrid);
    expect((await request(dollars).get('/api/insights/second-salary').set(ALICE)).body).toMatchObject({ milestones: [], gap: 'CURRENCY_MISMATCH' });
  });

  it('shows no one else’s costs', async () => {
    const app = build(worth(100_000_00));
    await request(app).post('/api/living-phases').set(ALICE).send(madrid);

    const bob = { Authorization: `Bearer ${generateToken('bob')}` };
    expect((await request(app).get('/api/insights/second-salary').set(bob)).body.gap).toBe('NO_CURRENT_PHASE');
  });

  it('rejects a malformed date', async () => {
    expect((await request(build(worth(0))).get('/api/insights/second-salary?asOf=tomorrow').set(ALICE)).status).toBe(400);
  });
});
