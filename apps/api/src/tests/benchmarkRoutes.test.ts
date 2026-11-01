import { salary } from './support/income';
import express from 'express';
import request from 'supertest';
import { CountryStatisticsService } from '../application/countryStatisticsService';
import type { StatisticsProvider } from '../application/ports';
import { benchmarksResponse } from '../contracts';
import { generateToken } from '../lib/auth';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { buildProfileFeature } from '../routes/profileFeature';
import { InMemoryCountryStatisticsRepository } from './support/inMemoryCountryStatistics';
import { InMemoryBillingRecordRepository, InMemoryLivingPhaseRepository, InMemoryProfileRepository } from './support/inMemoryRepositories';

const eurostat: StatisticsProvider = {
  name: 'eurostat',
  supports: (country) => country === 'ES',
  fetch: async () => ({ housingCostShare: { source: 'EUROSTAT', period: '2025', percent: 16 } }),
};

function build() {
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
      statistics: new CountryStatisticsService({ repository: new InMemoryCountryStatisticsRepository(), providers: [eurostat], now: () => Date.parse('2026-10-31T12:00:00Z') }),
      today: () => '2026-10-31',
      newId: () => `id-${++ids}`,
    })
  );
  return app;
}

const ALICE = { Authorization: `Bearer ${generateToken('alice')}` };
const BOB = { Authorization: `Bearer ${generateToken('bob')}` };
const madrid = { name: 'Madrid', city: 'Madrid', countryCode: 'ES', tenure: 'RENT', startDate: '2022-09-01', currency: 'EUR', incomeStreams: salary(320000), fixedCosts: [{ category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000 }] };

describe('GET /api/insights/benchmarks', () => {
  it('needs a token, ignores a token or user id in the URL, and is never cached', async () => {
    const app = build();

    expect((await request(app).get('/api/insights/benchmarks')).status).toBe(401);
    expect((await request(app).get('/api/insights/benchmarks').set('Authorization', 'Bearer nope')).status).toBe(403);
    expect((await request(app).get(`/api/insights/benchmarks?token=${generateToken('alice')}&userId=alice`)).status).toBe(401);
    expect((await request(app).get('/api/insights/benchmarks').set(ALICE)).headers['cache-control']).toBe('no-store');
  });

  it('compares the person’s living phases with their countries, as the contract says', async () => {
    const app = build();
    const { body: created } = await request(app).post('/api/living-phases').set(ALICE).send(madrid);

    const response = await request(app).get('/api/insights/benchmarks').set(ALICE);

    expect(response.status).toBe(200);
    const parsed = benchmarksResponse.parse(response.body);
    expect(parsed.asOf).toBe('2026-10-31');
    expect(parsed.phases[0]).toMatchObject({
      phaseId: created.id,
      housingBurden: { housingMonthlyMinor: 120000, yourSharePercent: 37.5, typicalSharePercent: 16, verdict: 'HIGHER' },
      gaps: ['NO_DISTRIBUTION', 'NO_PURCHASING_POWER'],
    });
  });

  it('shows nobody else’s living phases', async () => {
    const app = build();
    await request(app).post('/api/living-phases').set(ALICE).send(madrid);

    expect((await request(app).get('/api/insights/benchmarks').set(BOB)).body.phases).toEqual([]);
  });

  it('rejects a malformed date', async () => {
    const response = await request(build()).get('/api/insights/benchmarks?asOf=tomorrow').set(ALICE);

    expect(response.status).toBe(400);
  });
});
