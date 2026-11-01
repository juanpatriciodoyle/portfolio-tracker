import express from 'express';
import request from 'supertest';
import type { PortfolioValueReader } from '../application/ports';
import { capitalHorizonResponse } from '../contracts';
import { generateToken } from '../lib/auth';
import { AesGcmFieldCipher } from '../infrastructure/aesGcmFieldCipher';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { buildProfileFeature } from '../routes/profileFeature';
import { InMemoryBillingRecordRepository, InMemoryLivingPhaseRepository, InMemoryProfileRepository } from './support/inMemoryRepositories';

function build(portfolio: PortfolioValueReader, profileRepository = new InMemoryProfileRepository()) {
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
      profileRepository,
      billingRecordRepository: new InMemoryBillingRecordRepository(livingPhaseRepository),
      portfolio,
      today: () => '2026-10-31',
      newId: () => `id-${++ids}`,
    })
  );
  return { app, profileRepository };
}

const worth = (amountMinor: number, currency = 'EUR'): PortfolioValueReader => ({ netWorth: async () => ({ amountMinor, currency }) });

const ALICE = { Authorization: `Bearer ${generateToken('alice')}` };
const BOB = { Authorization: `Bearer ${generateToken('bob')}` };

// Income €3,200, costs €1,200: a monthly surplus of €2,000.
const madrid = {
  name: 'Madrid',
  city: 'Madrid',
  countryCode: 'ES',
  tenure: 'RENT',
  startDate: '2022-09-01',
  currency: 'EUR',
  monthlyIncomeMinor: 320_000,
  fixedCosts: [{ category: 'RENT', cadence: 'MONTHLY', amountMinor: 120_000 }],
};
const property = { id: 'm1', title: 'Property Down Payment', targetAmountMinor: 350_000_00, capitalRequiredPercentage: 30, category: 'PROPERTY', enabled: true };
const profile = { fullName: 'Ana', birthYear: 1990, nationalities: ['ES'], taxResidence: 'ES', householdAdults: 1, dependentChildren: 0, employmentStatus: 'EMPLOYEE' };

const save = (app: express.Express, milestones: unknown[], headers = ALICE) => request(app).put('/api/profile/capital-milestones').set(headers).send({ milestones });

describe('PUT /api/profile/capital-milestones', () => {
  it('needs a token', async () => {
    expect((await request(build(worth(0)).app).put('/api/profile/capital-milestones').send({ milestones: [] })).status).toBe(401);
  });

  it('saves the list, answering with nothing but success', async () => {
    const { app } = build(worth(0));
    const response = await save(app, [property]);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('rejects what the contract does not allow', async () => {
    const { app } = build(worth(0));
    expect((await save(app, [{ ...property, targetAmountMinor: 0 }])).status).toBe(400);
    expect((await save(app, [property, property])).status).toBe(400);
  });

  it('replaces the list, so an empty one deletes everything', async () => {
    const { app } = build(worth(0));
    await save(app, [property]);
    await save(app, []);
    expect((await request(app).get('/api/insights/capital-horizon').set(ALICE)).body.milestones).toEqual([]);
  });

  it('keeps the milestones when the profile is saved, and the profile when milestones are saved', async () => {
    const { app } = build(worth(0));
    await request(app).put('/api/profile').set(ALICE).send(profile);
    await save(app, [property]);
    await request(app).put('/api/profile').set(ALICE).send({ ...profile, fullName: 'Ana B' });

    expect((await request(app).get('/api/insights/capital-horizon').set(ALICE)).body.milestones).toHaveLength(1);
    const read = await request(app).get('/api/profile').set(ALICE);
    expect(read.body).toEqual({ ...profile, fullName: 'Ana B' });
  });

  it('seals the milestones: the stored profile shows no title or amount', async () => {
    const { app, profileRepository } = build(worth(0));
    await save(app, [property]);
    expect(JSON.stringify(await profileRepository.find('alice'))).not.toMatch(/Property Down Payment|35000000/);
  });
});

describe('GET /api/insights/capital-horizon', () => {
  it('needs a token, ignores one in the URL, and is never cached', async () => {
    const { app } = build(worth(0));
    expect((await request(app).get('/api/insights/capital-horizon')).status).toBe(401);
    expect((await request(app).get(`/api/insights/capital-horizon?token=${generateToken('alice')}`)).status).toBe(401);
    expect((await request(app).get('/api/insights/capital-horizon').set(ALICE)).headers['cache-control']).toBe('no-store');
  });

  it('paces each milestone with the surplus of the phase being lived', async () => {
    const { app } = build(worth(80_000_00));
    await request(app).post('/api/living-phases').set(ALICE).send(madrid);
    await save(app, [property]);

    const response = await request(app).get('/api/insights/capital-horizon').set(ALICE);

    expect(response.status).toBe(200);
    const parsed = capitalHorizonResponse.parse(response.body);
    expect(parsed).toMatchObject({ currency: 'EUR', liquidPortfolioMinor: 80_000_00, monthlySurplusMinor: 200_000, gap: null });
    expect(parsed.milestones[0]).toMatchObject({ id: 'm1', capitalNeededMinor: 105_000_00, capitalGapMinor: 25_000_00, monthsRemaining: 13, achieved: false });
  });

  it('says achieved once the portfolio holds the capital needed', async () => {
    const { app } = build(worth(105_000_00));
    await save(app, [property]);
    expect((await request(app).get('/api/insights/capital-horizon').set(ALICE)).body.milestones[0]).toMatchObject({ achieved: true, monthsRemaining: 0, progress: 1 });
  });

  it('shows the milestones without a pace when the surplus is unknown, with the reason', async () => {
    const empty = build(worth(0));
    await save(empty.app, [property]);
    expect((await request(empty.app).get('/api/insights/capital-horizon').set(ALICE)).body).toMatchObject({ gap: 'NO_CURRENT_PHASE', monthlySurplusMinor: null, milestones: [{ monthsRemaining: null }] });

    const dollars = build(worth(0, 'USD'));
    await request(dollars.app).post('/api/living-phases').set(ALICE).send(madrid);
    await save(dollars.app, [property]);
    expect((await request(dollars.app).get('/api/insights/capital-horizon').set(ALICE)).body).toMatchObject({ gap: 'CURRENCY_MISMATCH', monthlySurplusMinor: null });
  });

  it('shows no one else’s milestones, and leaves disabled ones in the list for the editor', async () => {
    const { app } = build(worth(0));
    await save(app, [{ ...property, enabled: false }]);
    expect((await request(app).get('/api/insights/capital-horizon').set(BOB)).body.milestones).toEqual([]);
    expect((await request(app).get('/api/insights/capital-horizon').set(ALICE)).body.milestones[0].enabled).toBe(false);
  });

  it('rejects a malformed date', async () => {
    expect((await request(build(worth(0)).app).get('/api/insights/capital-horizon?asOf=tomorrow').set(ALICE)).status).toBe(400);
  });
});
