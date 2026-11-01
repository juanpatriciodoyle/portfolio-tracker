import express from 'express';
import request from 'supertest';
import { AVERAGE_DAYS_PER_MONTH } from '../domain/calendarDate';
import { listLivingPhasesResponse, timelineResponse } from '../contracts';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { generateToken } from '../lib/auth';
import { buildProfileFeature } from '../routes/profileFeature';
import { InMemoryBillingRecordRepository, InMemoryLivingPhaseRepository, InMemoryProfileRepository } from './support/inMemoryRepositories';

const TODAY = '2026-04-30';
const ALICE = { Authorization: `Bearer ${generateToken('alice')}` };

function build() {
  const livingPhaseRepository = new InMemoryLivingPhaseRepository();
  let ids = 0;
  let iv = 0;
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    ...buildProfileFeature({
      cipher: new AesGcmFieldCipher(Buffer.alloc(32, 4), (size) => Buffer.alloc(size, (++iv % 250) + 1)),
      fingerprinter: new HmacBillFingerprinter(Buffer.alloc(32, 4)),
      livingPhaseRepository,
      profileRepository: new InMemoryProfileRepository(),
      billingRecordRepository: new InMemoryBillingRecordRepository(livingPhaseRepository),
      today: () => TODAY,
      newId: () => `id-${++ids}`,
    })
  );
  return app;
}

const madrid = {
  name: 'Madrid',
  city: 'Madrid',
  countryCode: 'ES',
  tenure: 'RENT',
  startDate: '2026-01-01',
  endDate: null,
  currency: 'EUR',
  monthlyIncomeMinor: 300000,
  fixedCosts: [
    { category: 'RENT', cadence: 'MONTHLY', amountMinor: 100000 },
    { category: 'ELECTRICITY', cadence: 'MONTHLY', amountMinor: 8000 },
    { category: 'INTERNET', cadence: 'MONTHLY', amountMinor: 3000, label: 'Fibre' },
  ],
};

const bill = (phaseId: string, change: Record<string, unknown>) => ({
  phaseId,
  category: 'ELECTRICITY',
  cadence: 'MONTHLY',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  amountMinor: 6000,
  vendor: 'Iberdrola',
  ...change,
});

async function createPhase(app: express.Express, body: object = madrid): Promise<string> {
  return (await request(app).post('/api/living-phases').set(ALICE).send(body)).body.id;
}

async function timelineEntry(app: express.Express) {
  const response = await request(app).get('/api/living-phases/timeline').set(ALICE);
  return timelineResponse.parse(response.body).entries[0];
}

describe('monthly costs once bills arrive', () => {
  it('start from the declared rates and say so', async () => {
    const app = build();
    await createPhase(app);

    const entry = await timelineEntry(app);

    expect(entry.monthlyFixedCostsMinor).toBe(111000);
    expect(entry.costBasisByCategory.ELECTRICITY).toEqual({ basis: 'DECLARED', billCount: 0 });
    expect(entry.costBasisByCategory.GAS).toEqual({ basis: null, billCount: 0 });
  });

  it('follow the average of the bills as each one is logged, without changing what was declared', async () => {
    const app = build();
    const phaseId = await createPhase(app);

    await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId, { amountMinor: 6000 })).expect(201);
    await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId, { amountMinor: 10000, periodStart: '2026-02-01', periodEnd: '2026-02-28' })).expect(201);
    const entry = await timelineEntry(app);

    expect(entry.fixedCostsByCategoryMinor.ELECTRICITY).toBe(8000);
    expect(entry.costBasisByCategory.ELECTRICITY).toEqual({ basis: 'BILLS', billCount: 2 });

    await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId, { amountMinor: 14000, periodStart: '2026-03-01', periodEnd: '2026-03-31' })).expect(201);
    expect((await timelineEntry(app)).fixedCostsByCategoryMinor.ELECTRICITY).toBe(10000);

    const phases = listLivingPhasesResponse.parse((await request(app).get('/api/living-phases').set(ALICE)).body).phases;
    expect(phases[0].fixedCosts.find((cost) => cost.category === 'ELECTRICITY')?.amountMinor).toBe(8000);
  });

  it('move an internet plan to its new price over the latest three months of bills', async () => {
    const app = build();
    const phaseId = await createPhase(app);
    const internet = (amountMinor: number, month: string, lastDay: string) =>
      bill(phaseId, { category: 'INTERNET', vendor: 'Digi', amountMinor, periodStart: `2026-${month}-01`, periodEnd: `2026-${month}-${lastDay}` });

    for (const [amount, month, lastDay] of [[3000, '01', '31'], [3000, '02', '28'], [3000, '03', '31']] as const) {
      await request(app).post('/api/billing-records').set(ALICE).send(internet(amount, month, lastDay)).expect(201);
    }
    expect((await timelineEntry(app)).fixedCostsByCategoryMinor.INTERNET).toBe(3000);

    await request(app).post('/api/billing-records').set(ALICE).send(internet(5000, '04', '30')).expect(201);
    expect((await timelineEntry(app)).fixedCostsByCategoryMinor.INTERNET).toBe(3667);
  });

  it('are read for the same household only', async () => {
    const app = build();
    const madridId = await createPhase(app);
    const lisbonId = await createPhase(app, { ...madrid, name: 'Lisbon', startDate: '2025-01-01', endDate: '2025-12-31', fixedCosts: [] });
    await request(app).post('/api/billing-records').set(ALICE).send(bill(lisbonId, { amountMinor: 20000, periodStart: '2025-02-01', periodEnd: '2025-02-28' })).expect(201);

    const entries = timelineResponse.parse((await request(app).get('/api/living-phases/timeline').set(ALICE)).body).entries;
    const current = entries.find((entry) => entry.phaseId === madridId);
    const past = entries.find((entry) => entry.phaseId === lisbonId);

    expect(current?.fixedCostsByCategoryMinor.ELECTRICITY).toBe(8000);
    expect(past?.fixedCostsByCategoryMinor.ELECTRICITY).toBe(20000);
  });
});

describe('income that changes during a phase', () => {
  const promoted = { ...madrid, incomeChanges: [{ startDate: '2026-04-01', amountMinor: 350000, reason: 'PROMOTION' }] };

  it('is stored with the phase and listed back, empty for a phase without changes', async () => {
    const app = build();
    await createPhase(app, promoted);
    await createPhase(app, { ...madrid, name: 'Old', startDate: '2020-01-01', endDate: '2020-12-31' });

    const phases = listLivingPhasesResponse.parse((await request(app).get('/api/living-phases').set(ALICE)).body).phases;

    expect(phases.find((phase) => phase.name === 'Madrid')?.incomeChanges).toEqual([
      { startDate: '2026-04-01', endDate: null, amountMinor: 350000, reason: 'PROMOTION' },
    ]);
    expect(phases.find((phase) => phase.name === 'Old')?.incomeChanges).toEqual([]);
  });

  it('shows the income active today and adds up every stretch into what was earned', async () => {
    const app = build();
    await createPhase(app, promoted);

    const entry = await timelineEntry(app);

    expect(entry.monthlyIncomeMinor).toBe(350000);
    expect(entry.totalIncomeMinor).toBe(Math.round((300000 * 90 + 350000 * 30) / AVERAGE_DAYS_PER_MONTH));
    expect(entry.savingsCapacityMinor).toBe(350000 - 111000);
  });

  it('can be replaced on an existing phase, including a stretch without work at zero', async () => {
    const app = build();
    const id = await createPhase(app);

    await request(app)
      .patch(`/api/living-phases/${id}`)
      .set(ALICE)
      .send({ incomeChanges: [{ startDate: '2026-02-01', endDate: '2026-02-28', amountMinor: 0, reason: 'UNEMPLOYMENT' }] })
      .expect(204);
    const entry = await timelineEntry(app);

    expect(entry.monthlyIncomeMinor).toBe(300000);
    expect(entry.totalIncomeMinor).toBe(Math.round((300000 * (120 - 28)) / AVERAGE_DAYS_PER_MONTH));

    await request(app).patch(`/api/living-phases/${id}`).set(ALICE).send({ incomeChanges: [] }).expect(204);
    expect((await timelineEntry(app)).totalIncomeMinor).toBe(Math.round((300000 * 120) / AVERAGE_DAYS_PER_MONTH));
  });

  it('refuses a change that ends before it starts', async () => {
    const app = build();
    const response = await request(app)
      .post('/api/living-phases')
      .set(ALICE)
      .send({ ...madrid, incomeChanges: [{ startDate: '2026-03-01', endDate: '2026-02-01', amountMinor: 1 }] });
    expect(response.status).toBe(400);
  });
});
