import type { PrismaClient } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import {
  DUPLICATE_BILLING_RECORD,
  duplicateBillingRecordErrorResponse,
  ENCRYPTION_NOT_CONFIGURED,
  listBillingRecordsResponse,
  listLivingPhasesResponse,
  phaseComparisonResponse,
  phaseOverlapErrorResponse,
  profileResponse,
  timelineResponse,
  trendsResponse,
  validationErrorResponse,
} from '../contracts';
import { generateToken } from '../lib/auth';
import { AesGcmFieldCipher, FieldCipherConfigError } from '../infrastructure/aesGcmFieldCipher';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { buildProfileFeature, mountProfileFeature } from '../routes/profileFeature';
import type { FxRateProvider } from '../application/ports';
import {
  InMemoryBillingRecordRepository,
  InMemoryLivingPhaseRepository,
  InMemoryProfileRepository,
} from './support/inMemoryRepositories';

const TODAY = '2026-10-31';

const madrid = {
  name: 'Madrid',
  city: 'Madrid',
  address: 'Calle de Alcalá 123, 4ºB',
  countryCode: 'ES',
  tenure: 'RENT',
  startDate: '2022-09-01',
  endDate: '2024-08-31',
  currency: 'EUR',
  monthlyIncomeMinor: 320000,
  notes: 'Close to the office',
  fixedCosts: [
    { category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000, label: 'Landlord Pérez' },
    { category: 'ELECTRICITY', cadence: 'BIMONTHLY', amountMinor: 9600 },
  ],
};

const lisbon = {
  name: 'Lisbon',
  city: 'Lisboa',
  countryCode: 'PT',
  tenure: 'RENT',
  startDate: '2024-09-01',
  endDate: null,
  currency: 'EUR',
  monthlyIncomeMinor: 350000,
  fixedCosts: [{ category: 'RENT', cadence: 'MONTHLY', amountMinor: 90000 }],
};

function build(fx?: FxRateProvider) {
  const livingPhaseRepository = new InMemoryLivingPhaseRepository();
  const billingRecordRepository = new InMemoryBillingRecordRepository(livingPhaseRepository);
  const profileRepository = new InMemoryProfileRepository();
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
      profileRepository,
      billingRecordRepository,
      fx,
      today: () => TODAY,
      newId: () => `id-${++ids}`,
    })
  );
  return { app, livingPhaseRepository, profileRepository, billingRecordRepository };
}

const as = (userId: string) => ({ Authorization: `Bearer ${generateToken(userId)}` });
const ALICE = as('alice');
const BOB = as('bob');

describe('who is asking', () => {
  const endpoints: [string, string][] = [
    ['get', '/api/living-phases'],
    ['get', '/api/living-phases/timeline'],
    ['get', '/api/living-phases/compare?from=a&to=b'],
    ['post', '/api/living-phases'],
    ['post', '/api/living-phases/backfill'],
    ['patch', '/api/living-phases/x'],
    ['delete', '/api/living-phases/x'],
    ['post', '/api/living-phases/x/fixed-costs'],
    ['patch', '/api/living-phases/x/fixed-costs/y'],
    ['delete', '/api/living-phases/x/fixed-costs/y'],
    ['get', '/api/billing-records'],
    ['post', '/api/billing-records'],
    ['patch', '/api/billing-records/x'],
    ['delete', '/api/billing-records/x'],
    ['get', '/api/insights/trends'],
    ['get', '/api/profile'],
    ['put', '/api/profile'],
  ];

  it.each(endpoints)('%s %s needs a token', async (method, path) => {
    const { app } = build();
    const agent = request(app) as unknown as Record<string, (path: string) => request.Test>;

    expect((await agent[method](path)).status).toBe(401);
    expect((await agent[method](path).set('Authorization', 'Bearer not-a-real-token')).status).toBe(403);
  });

  it('does not accept a token in the URL', async () => {
    const { app } = build();

    const response = await request(app).get('/api/living-phases').query({ token: generateToken('alice') });

    expect(response.status).toBe(401);
  });

  it('ignores a userId in the URL: the token alone decides whose data it is', async () => {
    const { app } = build();
    await request(app).post('/api/living-phases').set(ALICE).send(madrid).expect(201);

    const asBob = await request(app).get('/api/living-phases').query({ userId: 'alice' }).set(BOB);

    expect(asBob.status).toBe(200);
    expect(asBob.body).toEqual({ phases: [] });
  });

  it('marks every answer as not cacheable', async () => {
    const { app } = build();

    expect((await request(app).get('/api/living-phases').set(ALICE)).headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/api/profile').set(ALICE)).headers['cache-control']).toBe('no-store');
  });
});

describe('what a request must look like', () => {
  it('rejects unknown fields, including an attempt to set the owner, without echoing values', async () => {
    const { app } = build();

    const response = await request(app).post('/api/living-phases').set(ALICE).send({ ...madrid, userId: 'someone-else' });

    expect(response.status).toBe(400);
    expect(validationErrorResponse.safeParse(response.body).success).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('someone-else');
  });

  it('points at the field that is wrong', async () => {
    const { app } = build();

    const response = await request(app).post('/api/living-phases').set(ALICE).send({ ...madrid, startDate: '2022-02-30' });

    expect(response.status).toBe(400);
    expect(response.body.issues.map((issue: { path: string }) => issue.path)).toContain('startDate');
  });

  it.each([
    ['an impossible as-of date', '/api/living-phases/timeline?asOf=2026-13-01'],
    ['a missing comparison target', '/api/living-phases/compare?from=a'],
  ])('rejects %s', async (_label, path) => {
    const { app } = build();

    expect((await request(app).get(path).set(ALICE)).status).toBe(400);
  });

  it('checks the profile too', async () => {
    const { app } = build();

    expect((await request(app).put('/api/profile').set(ALICE).send({ fullName: 'x' })).status).toBe(400);
  });
});

describe('living phases over HTTP', () => {
  it('creates a phase, answering with its id only, and lists it decrypted', async () => {
    const { app } = build();

    const created = await request(app).post('/api/living-phases').set(ALICE).send(madrid);
    const listed = await request(app).get('/api/living-phases').set(ALICE);

    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 'id-1' });
    const parsed = listLivingPhasesResponse.parse(listed.body);
    expect(parsed.phases[0]).toMatchObject({ id: 'id-1', name: 'Madrid', address: 'Calle de Alcalá 123, 4ºB' });
    expect(parsed.phases[0].fixedCosts).toHaveLength(2);
  });

  it('keeps everything personal out of the stored rows', async () => {
    const { app, livingPhaseRepository } = build();
    await request(app).post('/api/living-phases').set(ALICE).send(madrid).expect(201);

    const stored = JSON.stringify(livingPhaseRepository.dump());

    for (const secret of ['Madrid', 'Alcal', 'Landlord', 'Close to the office', '320000', '120000']) {
      expect(stored).not.toContain(secret);
    }
  });

  it('builds the timeline and defaults to today when no day is given', async () => {
    const { app } = build();
    await request(app).post('/api/living-phases').set(ALICE).send(madrid).expect(201);
    await request(app).post('/api/living-phases').set(ALICE).send(lisbon).expect(201);

    const defaulted = timelineResponse.parse((await request(app).get('/api/living-phases/timeline').set(ALICE)).body);
    const earlier = timelineResponse.parse(
      (await request(app).get('/api/living-phases/timeline').query({ asOf: '2023-06-01' }).set(ALICE)).body
    );

    expect(defaulted.asOf).toBe(TODAY);
    expect(defaulted.entries.map((entry) => entry.status)).toEqual(['past', 'current']);
    expect(earlier.entries.map((entry) => entry.status)).toEqual(['current', 'upcoming']);
    expect(defaulted.entries[0]).toMatchObject({ name: 'Madrid', monthlyFixedCostsMinor: 124800 });
  });

  it('compares two phases', async () => {
    const { app } = build();
    const first = (await request(app).post('/api/living-phases').set(ALICE).send(madrid)).body.id;
    const second = (await request(app).post('/api/living-phases').set(ALICE).send(lisbon)).body.id;

    const response = await request(app).get('/api/living-phases/compare').query({ from: first, to: second }).set(ALICE);

    const parsed = phaseComparisonResponse.parse(response.body);
    expect(parsed).toMatchObject({ comparable: true, monthlyFixedCostsDeltaMinor: -34800 });
  });

  it('rejects overlapping dates with the ids of the phases in the way', async () => {
    const { app } = build();
    await request(app).post('/api/living-phases').set(ALICE).send(madrid).expect(201);

    const response = await request(app)
      .post('/api/living-phases')
      .set(ALICE)
      .send({ ...madrid, startDate: '2024-01-01', endDate: '2024-12-31' });

    expect(response.status).toBe(409);
    expect(phaseOverlapErrorResponse.parse(response.body).conflictingPhaseIds).toEqual(['id-1']);
  });

  it('updates a phase (204), and explains a business-rule failure with 422', async () => {
    const { app } = build();
    const { id } = (await request(app).post('/api/living-phases').set(ALICE).send(madrid)).body;

    await request(app).patch(`/api/living-phases/${id}`).set(ALICE).send({ city: 'Getafe' }).expect(204);
    const rejected = await request(app).patch(`/api/living-phases/${id}`).set(ALICE).send({ endDate: '2022-08-31' });

    expect(rejected.status).toBe(422);
    expect(
      listLivingPhasesResponse.parse((await request(app).get('/api/living-phases').set(ALICE)).body).phases[0].city
    ).toBe('Getafe');
  });

  it('deletes a phase, and then it is gone', async () => {
    const { app } = build();
    const { id } = (await request(app).post('/api/living-phases').set(ALICE).send(madrid)).body;

    await request(app).delete(`/api/living-phases/${id}`).set(ALICE).expect(204);

    expect((await request(app).delete(`/api/living-phases/${id}`).set(ALICE)).status).toBe(404);
    expect((await request(app).get('/api/living-phases').set(ALICE)).body).toEqual({ phases: [] });
  });

  it('backfills a history all-or-nothing', async () => {
    const { app } = build();
    const past = { ...madrid, fixedCosts: [], startDate: '2018-01-01', endDate: '2019-12-31' };
    const clash = { ...madrid, fixedCosts: [], startDate: '2019-06-01', endDate: '2020-06-01' };

    const rejected = await request(app).post('/api/living-phases/backfill').set(ALICE).send({ phases: [past, clash] });
    const saved = await request(app).post('/api/living-phases/backfill').set(ALICE).send({ phases: [past] });

    expect(rejected.status).toBe(409);
    expect(saved.status).toBe(201);
    expect(saved.body.ids).toHaveLength(1);
    expect((await request(app).get('/api/living-phases').set(ALICE)).body.phases).toHaveLength(1);
  });

  it('adds, changes and removes a fixed cost', async () => {
    const { app } = build();
    const { id } = (await request(app).post('/api/living-phases').set(ALICE).send(lisbon)).body;

    const added = await request(app)
      .post(`/api/living-phases/${id}/fixed-costs`)
      .set(ALICE)
      .send({ category: 'WATER', cadence: 'QUARTERLY', amountMinor: 4500 });
    await request(app).patch(`/api/living-phases/${id}/fixed-costs/${added.body.id}`).set(ALICE).send({ amountMinor: 4800 }).expect(204);

    const water = listLivingPhasesResponse
      .parse((await request(app).get('/api/living-phases').set(ALICE)).body)
      .phases[0].fixedCosts.find((cost) => cost.id === added.body.id);
    expect(added.status).toBe(201);
    expect(water).toMatchObject({ category: 'WATER', cadence: 'QUARTERLY', amountMinor: 4800 });

    await request(app).delete(`/api/living-phases/${id}/fixed-costs/${added.body.id}`).set(ALICE).expect(204);
    expect((await request(app).delete(`/api/living-phases/${id}/fixed-costs/${added.body.id}`).set(ALICE)).status).toBe(404);
  });

  it('treats someone else’s phases exactly like phases that do not exist', async () => {
    const { app } = build();
    const first = (await request(app).post('/api/living-phases').set(ALICE).send(madrid)).body.id;
    const cost = (await request(app).get('/api/living-phases').set(ALICE)).body.phases[0].fixedCosts[0].id;

    const attempts = [
      request(app).patch(`/api/living-phases/${first}`).set(BOB).send({ city: 'Hijack' }),
      request(app).delete(`/api/living-phases/${first}`).set(BOB),
      request(app).get('/api/living-phases/compare').query({ from: first, to: first }).set(BOB),
      request(app).post(`/api/living-phases/${first}/fixed-costs`).set(BOB).send({ category: 'GAS', cadence: 'MONTHLY', amountMinor: 1 }),
      request(app).patch(`/api/living-phases/${first}/fixed-costs/${cost}`).set(BOB).send({ amountMinor: 1 }),
      request(app).delete(`/api/living-phases/${first}/fixed-costs/${cost}`).set(BOB),
    ];

    for (const attempt of attempts) expect((await attempt).status).toBe(404);
    expect((await request(app).get('/api/living-phases').set(ALICE)).body.phases[0].city).toBe('Madrid');
  });

  it('answers a damaged row with a plain 500 that reveals nothing', async () => {
    const { app, livingPhaseRepository } = build();
    await request(app).post('/api/living-phases').set(ALICE).send(madrid).expect(201);
    livingPhaseRepository.corruptPayload('id-1');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).get('/api/living-phases').set(ALICE);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

describe('bills and trends over HTTP', () => {
  const bill = (phaseId: string, change: Record<string, unknown> = {}) => ({
    phaseId,
    category: 'RENT',
    cadence: 'MONTHLY',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    amountMinor: 120000,
    vendor: 'Landlord Marta',
    ...change,
  });
  const setup = async () => {
    const world = build();
    const { id } = (await request(world.app).post('/api/living-phases').set(ALICE).send(madrid)).body;
    return { ...world, phaseId: id as string };
  };

  it('records a bill (id only), lists it decrypted with its currency, and keeps it encrypted', async () => {
    const { app, phaseId, billingRecordRepository } = await setup();

    const created = await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId));
    const listed = listBillingRecordsResponse.parse((await request(app).get('/api/billing-records').query({ phaseId }).set(ALICE)).body);

    expect(created.status).toBe(201);
    expect(Object.keys(created.body)).toEqual(['id']);
    expect(listed.records[0]).toMatchObject({ vendor: 'Landlord Marta', amountMinor: 120000, currency: 'EUR' });
    expect(JSON.stringify(billingRecordRepository.dump())).not.toContain('Marta');
  });

  it('answers 409 with the existing bill when the same bill is recorded twice', async () => {
    const { app, phaseId } = await setup();
    const { id } = (await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId))).body;

    const again = await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId, { vendor: 'LANDLORD marta' }));

    expect(again.status).toBe(409);
    expect(duplicateBillingRecordErrorResponse.parse(again.body)).toMatchObject({ code: DUPLICATE_BILLING_RECORD, existingRecordId: id });
    expect(JSON.stringify(again.body)).not.toContain('Marta');
  });

  it('changes and removes a bill', async () => {
    const { app, phaseId } = await setup();
    const { id } = (await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId))).body;

    await request(app).patch(`/api/billing-records/${id}`).set(ALICE).send({ amountMinor: 125000, notes: null }).expect(204);
    expect((await request(app).get('/api/billing-records').set(ALICE)).body.records[0].amountMinor).toBe(125000);
    await request(app).delete(`/api/billing-records/${id}`).set(ALICE).expect(204);

    expect((await request(app).delete(`/api/billing-records/${id}`).set(ALICE)).status).toBe(404);
  });

  it('rejects bad input with 400, a broken business rule with 422, and a foreign phase with 404', async () => {
    const { app, phaseId } = await setup();

    expect((await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId, { periodEnd: '2026-08-01' }))).status).toBe(400);
    expect((await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId, { userId: 'x' }))).status).toBe(400);
    expect((await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId, { periodStart: '2023-01-01', periodEnd: '2026-01-01' }))).status).toBe(422);
    expect((await request(app).post('/api/billing-records').set(BOB).send(bill(phaseId))).status).toBe(404);
  });

  it('shows nobody else’s bills or trends', async () => {
    const { app, phaseId } = await setup();
    await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId)).expect(201);

    expect((await request(app).get('/api/billing-records').query({ userId: 'alice' }).set(BOB)).body).toEqual({ records: [] });
    expect(trendsResponse.parse((await request(app).get('/api/insights/trends').set(BOB)).body).phases).toEqual([]);
  });

  it('serves trends that match the contract, defaulting to today', async () => {
    const { app, phaseId } = await setup();
    await request(app).post('/api/billing-records').set(ALICE).send(bill(phaseId)).expect(201);

    const trends = trendsResponse.parse((await request(app).get('/api/insights/trends').set(ALICE)).body);

    expect(trends).toMatchObject({ asOf: TODAY, lastCompleteMonth: '2026-09' });
    expect(trends.fixedCosts[0].windows[0]).toMatchObject({ windowMonths: 3, coveredMonths: 1, averageMinor: 120000 });
    expect((await request(app).get('/api/insights/trends').query({ asOf: 'nope' }).set(ALICE)).status).toBe(400);
  });
});

describe('comparing across currencies over HTTP', () => {
  it('converts with the rates it is given and labels the source', async () => {
    const fx: FxRateProvider = { ratesFor: async () => ({ rates: { EUR: 1, ARS: 0.0006 }, sources: { ARS: 'BCRA_OFFICIAL' } }) };
    const { app } = build(fx);
    const first = (await request(app).post('/api/living-phases').set(ALICE).send({ ...madrid, fixedCosts: [{ category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000 }] })).body.id;
    const second = (
      await request(app)
        .post('/api/living-phases')
        .set(ALICE)
        .send({ ...lisbon, name: 'Buenos Aires', countryCode: 'AR', currency: 'ARS', fixedCosts: [{ category: 'RENT', cadence: 'MONTHLY', amountMinor: 40000000 }] })
    ).body.id;

    const result = phaseComparisonResponse.parse((await request(app).get('/api/living-phases/compare').query({ from: first, to: second }).set(ALICE)).body);

    expect(result).toMatchObject({ comparable: true, currency: 'ARS', rateSources: [{ currency: 'ARS', source: 'BCRA_OFFICIAL' }] });
  });
});

describe('the profile over HTTP', () => {
  const profile = {
    fullName: 'Juan Patricio Doyle',
    birthYear: 1990,
    nationalities: ['AR', 'ES'],
    taxResidence: 'ES',
    householdAdults: 1,
    dependentChildren: 0,
    employmentStatus: 'EMPLOYEE',
  };

  it('starts empty, then keeps what was saved, encrypted', async () => {
    const { app, profileRepository } = build();

    const empty = profileResponse.parse((await request(app).get('/api/profile').set(ALICE)).body);
    await request(app).put('/api/profile').set(ALICE).send(profile).expect(204);
    const saved = profileResponse.parse((await request(app).get('/api/profile').set(ALICE)).body);

    expect(empty.fullName).toBeNull();
    expect(saved).toEqual(profile);
    expect(JSON.stringify(profileRepository.dump())).not.toContain('Doyle');
  });

  it('refuses a birth year in the future with 422', async () => {
    const { app } = build();

    expect((await request(app).put('/api/profile').set(ALICE).send({ ...profile, birthYear: 2027 })).status).toBe(422);
  });
});

describe('the rest of the API', () => {
  // Routes that existed before this feature, registered after it, exactly as index.ts does.
  const addExistingRoutes = (app: express.Express) => {
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    app.post('/api/auth/demo', (_req, res) => res.json({ success: true }));
    app.get('/api/transactions', (_req, res) => res.json({ transactions: [] }));
  };

  it('is left alone: routes outside this feature need no token from it', async () => {
    const { app } = build();
    addExistingRoutes(app);

    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).post('/api/auth/demo')).status).toBe(200);
    expect((await request(app).get('/api/transactions')).status).toBe(200);
  });

  it('is also left alone while encryption is unavailable', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const app = express();
    app.use(express.json());
    mountProfileFeature(app, { env: {}, prisma: {} as PrismaClient });
    addExistingRoutes(app);

    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).post('/api/auth/demo')).status).toBe(200);
  });
});

describe('mounting the feature', () => {
  const key = Buffer.alloc(32, 1).toString('base64');
  const prisma = {} as PrismaClient;

  it('keeps a development server running without a key, but answers 503 on these routes', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const app = express();
    app.use(express.json());

    mountProfileFeature(app, { env: {}, prisma });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('PROFILE_ENCRYPTION_KEY'));
    const response = await request(app).get('/api/living-phases').set(ALICE);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe(ENCRYPTION_NOT_CONFIGURED);
    expect((await request(app).put('/api/profile').set(ALICE).send({})).status).toBe(503);
    expect((await request(app).get('/api/billing-records').set(ALICE)).status).toBe(503);
    expect((await request(app).get('/api/insights/trends').set(ALICE)).status).toBe(503);
    expect((await request(app).get('/api/living-phases')).status).toBe(401);
  });

  it('refuses to start a production server without a key', () => {
    expect(() => mountProfileFeature(express(), { env: { NODE_ENV: 'production' }, prisma })).toThrow(FieldCipherConfigError);
  });

  it('refuses to start with a malformed key, in any mode', () => {
    expect(() => mountProfileFeature(express(), { env: { NODE_ENV: 'production', PROFILE_ENCRYPTION_KEY: 'short' }, prisma })).toThrow(
      FieldCipherConfigError
    );
  });

  it('mounts the real routes when a key is present', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const app = express();

    mountProfileFeature(app, { env: { PROFILE_ENCRYPTION_KEY: key }, prisma });

    expect(warn).not.toHaveBeenCalled();
    expect((await request(app).get('/api/profile')).status).toBe(401);
  });
});
