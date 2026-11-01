import { salary } from './support/income';
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
  incomeStreams: salary(300000),
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

describe('income streams of a phase', () => {
  const job = { label: 'Job', amountMinor: 300000, startDate: '2026-01-01', endDate: null };
  const freelance = { label: 'Freelance', amountMinor: 50000, startDate: '2026-04-01', endDate: null };
  const withFreelance = { ...madrid, incomeStreams: [job, freelance] };

  it('are stored with the phase and listed back, empty for a phase without income', async () => {
    const app = build();
    await createPhase(app, withFreelance);
    await createPhase(app, { ...madrid, name: 'Sabbatical', startDate: '2020-01-01', endDate: '2020-12-31', incomeStreams: [] });

    const phases = listLivingPhasesResponse.parse((await request(app).get('/api/living-phases').set(ALICE)).body).phases;

    expect(phases.find((phase) => phase.name === 'Madrid')?.incomeStreams).toEqual([job, freelance]);
    expect(phases.find((phase) => phase.name === 'Sabbatical')?.incomeStreams).toEqual([]);
  });

  it('add up on the timeline: the rate today, the total earned and the average month', async () => {
    const app = build();
    await createPhase(app, withFreelance);

    const entry = await timelineEntry(app);

    expect(entry.monthlyIncomeMinor).toBe(350000);
    expect(entry.totalIncomeMinor).toBe(Math.round((300000 * 120 + 50000 * 30) / AVERAGE_DAYS_PER_MONTH));
    expect(entry.savingsCapacityMinor).toBe(350000 - 111000);
    expect(entry.averageMonthlyIncomeMinor).toBe(Math.round(entry.totalIncomeMinor / (120 / AVERAGE_DAYS_PER_MONTH)));
    expect(entry.averageSavingsCapacityMinor).toBe(entry.averageMonthlyIncomeMinor - 111000);
  });

  it('leave a gap as zero, and the whole list can be replaced on an existing phase', async () => {
    const app = build();
    const id = await createPhase(app);

    await request(app)
      .patch(`/api/living-phases/${id}`)
      .set(ALICE)
      .send({ incomeStreams: [{ label: 'Job', amountMinor: 300000, startDate: '2026-01-01', endDate: '2026-01-31' }] })
      .expect(204);
    const entry = await timelineEntry(app);

    expect(entry.monthlyIncomeMinor).toBe(0);
    expect(entry.savingsRate).toBeNull();
    expect(entry.savingsCapacityMinor).toBe(-111000);
    expect(entry.totalIncomeMinor).toBe(Math.round((300000 * 31) / AVERAGE_DAYS_PER_MONTH));

    await request(app).patch(`/api/living-phases/${id}`).set(ALICE).send({ incomeStreams: [] }).expect(204);
    expect((await timelineEntry(app)).totalIncomeMinor).toBe(0);
  });

  it('are optional when creating a phase', async () => {
    const app = build();
    const { incomeStreams: _omitted, ...withoutIncome } = madrid;
    await request(app).post('/api/living-phases').set(ALICE).send(withoutIncome).expect(201);
  });

  it('refuse a stream that ends before it starts, or has no label', async () => {
    const app = build();
    const post = (stream: object) => request(app).post('/api/living-phases').set(ALICE).send({ ...madrid, incomeStreams: [stream] });
    expect((await post({ label: 'Job', amountMinor: 1, startDate: '2026-03-01', endDate: '2026-02-01' })).status).toBe(400);
    expect((await post({ label: ' ', amountMinor: 1, startDate: '2026-03-01' })).status).toBe(400);
  });
});
