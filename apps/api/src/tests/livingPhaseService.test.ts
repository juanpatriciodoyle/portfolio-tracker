import { ResourceNotFoundError } from '../application/errors';
import { LivingPhaseService } from '../application/livingPhaseService';
import { createLivingPhaseRequest, type CreateLivingPhaseInput } from '../contracts';
import { InvalidLivingPhaseError, PhaseOverlapError } from '../domain/errors';
import { AesGcmFieldCipher, FieldCipherError } from '../infrastructure/aesGcmFieldCipher';
import { InMemoryLivingPhaseRepository } from './support/inMemoryRepositories';

const USER = 'user-1';
const OTHER_USER = 'user-2';

const madridInput: CreateLivingPhaseInput = {
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

const lisbonInput: CreateLivingPhaseInput = {
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

const request = (input: CreateLivingPhaseInput, change: Partial<CreateLivingPhaseInput> = {}) =>
  createLivingPhaseRequest.parse({ ...input, ...change });

function build() {
  const repository = new InMemoryLivingPhaseRepository();
  let ids = 0;
  let iv = 0;
  const service = new LivingPhaseService({
    repository,
    // Fixed, distinct IVs keep these tests deterministic; production uses random ones.
    cipher: new AesGcmFieldCipher(Buffer.alloc(32, 9), (size) => Buffer.alloc(size, (++iv % 250) + 1)),
    newId: () => `id-${++ids}`,
  });
  return { service, repository };
}

describe('creating and listing phases', () => {
  it('answers a create with just the new id', async () => {
    const { service } = build();

    expect(await service.createPhase(USER, request(madridInput))).toEqual({ id: 'id-1' });
  });

  it('lists a phase decrypted, with its fixed costs', async () => {
    const { service } = build();
    await service.createPhase(USER, request(madridInput));

    const [phase] = await service.listPhases(USER);

    expect(phase).toMatchObject({
      id: 'id-1',
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
    });
    expect(phase.fixedCosts).toEqual([
      expect.objectContaining({ category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000, label: 'Landlord Pérez', notes: null }),
      expect.objectContaining({ category: 'ELECTRICITY', cadence: 'BIMONTHLY', amountMinor: 9600, label: null }),
    ]);
  });

  it('keeps optional text as null when it was never given', async () => {
    const { service } = build();
    await service.createPhase(USER, request(lisbonInput));

    const [phase] = await service.listPhases(USER);

    expect(phase).toMatchObject({ address: null, notes: null });
  });

  it('stores no personal data in readable form', async () => {
    const { service, repository } = build();
    await service.createPhase(USER, request(madridInput));

    const stored = JSON.stringify(repository.dump());

    for (const secret of ['Madrid', 'Alcal', 'Landlord', 'Close to the office', '320000', '120000']) {
      expect(stored).not.toContain(secret);
    }
  });

  it('keeps only the columns the database needs readable', async () => {
    const { service, repository } = build();
    await service.createPhase(USER, request(madridInput));

    const [row] = repository.dump() as { userId: string; phase: Record<string, unknown> }[];

    expect(row.phase).toMatchObject({
      startDate: '2022-09-01',
      endDate: '2024-08-31',
      currency: 'EUR',
      countryCode: 'ES',
      tenure: 'RENT',
    });
  });

  it('lists phases oldest first', async () => {
    const { service } = build();
    await service.createPhase(USER, request(lisbonInput));
    await service.createPhase(USER, request(madridInput));

    expect((await service.listPhases(USER)).map((phase) => phase.name)).toEqual(['Madrid', 'Lisbon']);
  });

  it('keeps every person’s phases separate', async () => {
    const { service } = build();
    await service.createPhase(USER, request(madridInput));

    expect(await service.listPhases(OTHER_USER)).toEqual([]);
  });

  it('refuses to read a row whose stored data was tampered with', async () => {
    const { service, repository } = build();
    await service.createPhase(USER, request(madridInput));
    repository.corruptPayload('id-1');

    await expect(service.listPhases(USER)).rejects.toThrow(FieldCipherError);
  });
});

describe('overlapping phases are rejected', () => {
  it('names the phase it would overlap and stores nothing', async () => {
    const { service } = build();
    await service.createPhase(USER, request(madridInput));

    const clash = service.createPhase(USER, request(madridInput, { name: 'Clash', startDate: '2024-01-01', endDate: '2024-12-31' }));

    await expect(clash).rejects.toBeInstanceOf(PhaseOverlapError);
    await expect(clash).rejects.toMatchObject({ conflictingPhaseIds: ['id-1'] });
    expect(await service.listPhases(USER)).toHaveLength(1);
  });

  it('accepts a phase that starts the day after another ends', async () => {
    const { service } = build();
    await service.createPhase(USER, request(madridInput));

    await expect(service.createPhase(USER, request(lisbonInput))).resolves.toBeDefined();
  });

  it('accepts only one current (open-ended) phase', async () => {
    const { service } = build();
    await service.createPhase(USER, request(lisbonInput));

    await expect(
      service.createPhase(USER, request(lisbonInput, { name: 'Second home', startDate: '2025-01-01' }))
    ).rejects.toBeInstanceOf(PhaseOverlapError);
  });

  it('does not compare one person’s phases with another’s', async () => {
    const { service } = build();
    await service.createPhase(USER, request(madridInput));

    await expect(service.createPhase(OTHER_USER, request(madridInput))).resolves.toBeDefined();
  });
});

describe('updating a phase', () => {
  it('changes only what was sent', async () => {
    const { service } = build();
    const { id } = await service.createPhase(USER, request(madridInput));

    await service.updatePhase(USER, id, { city: 'Getafe', monthlyIncomeMinor: 330000 });

    expect((await service.listPhases(USER))[0]).toMatchObject({
      name: 'Madrid',
      city: 'Getafe',
      monthlyIncomeMinor: 330000,
      address: 'Calle de Alcalá 123, 4ºB',
      startDate: '2022-09-01',
    });
  });

  it('clears optional text with null', async () => {
    const { service } = build();
    const { id } = await service.createPhase(USER, request(madridInput));

    await service.updatePhase(USER, id, { address: null, notes: null });

    expect((await service.listPhases(USER))[0]).toMatchObject({ address: null, notes: null });
  });

  it('can end a current phase, and keeps the new data encrypted', async () => {
    const { service, repository } = build();
    const { id } = await service.createPhase(USER, request(lisbonInput));

    await service.updatePhase(USER, id, { endDate: '2026-06-30', city: 'Porto' });

    expect((await service.listPhases(USER))[0]).toMatchObject({ endDate: '2026-06-30', city: 'Porto' });
    expect(JSON.stringify(repository.dump())).not.toContain('Porto');
  });

  it('rejects dates that would overlap another phase, but lets a phase keep its own dates', async () => {
    const { service } = build();
    const { id: madrid } = await service.createPhase(USER, request(madridInput));
    await service.createPhase(USER, request(lisbonInput));

    await expect(service.updatePhase(USER, madrid, { endDate: null })).rejects.toBeInstanceOf(PhaseOverlapError);
    await expect(service.updatePhase(USER, madrid, { endDate: '2024-08-31', name: 'Madrid again' })).resolves.toBeUndefined();
  });

  it('rejects an end date before the start date', async () => {
    const { service } = build();
    const { id } = await service.createPhase(USER, request(madridInput));

    await expect(service.updatePhase(USER, id, { endDate: '2022-08-31' })).rejects.toBeInstanceOf(InvalidLivingPhaseError);
  });

  it('cannot reach a phase that does not exist or belongs to someone else', async () => {
    const { service } = build();
    const { id } = await service.createPhase(USER, request(madridInput));

    await expect(service.updatePhase(USER, 'missing', { city: 'x' })).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.updatePhase(OTHER_USER, id, { city: 'x' })).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});

describe('backfilling a history', () => {
  const earlier = request(madridInput, { name: 'Early days', startDate: '2018-01-01', endDate: '2019-12-31', fixedCosts: [] });
  const middle = request(madridInput, { name: 'Middle', startDate: '2020-01-01', endDate: '2022-08-31' });

  it('saves several past phases at once, with their costs', async () => {
    const { service } = build();

    const { ids } = await service.backfillPhases(USER, [earlier, middle]);

    expect(ids).toHaveLength(2);
    const phases = await service.listPhases(USER);
    expect(phases.map((phase) => phase.name)).toEqual(['Early days', 'Middle']);
    expect(phases[1].fixedCosts).toHaveLength(2);
  });

  it('saves nothing when two of the phases overlap each other', async () => {
    const { service } = build();

    await expect(
      service.backfillPhases(USER, [earlier, request(madridInput, { name: 'Clash', startDate: '2019-06-01', endDate: '2020-06-01' })])
    ).rejects.toBeInstanceOf(PhaseOverlapError);

    expect(await service.listPhases(USER)).toEqual([]);
  });

  it('saves nothing when one of the phases overlaps an existing one', async () => {
    const { service } = build();
    await service.createPhase(USER, request(madridInput));

    await expect(
      service.backfillPhases(USER, [earlier, request(madridInput, { name: 'Clash', startDate: '2023-01-01', endDate: '2023-12-31' })])
    ).rejects.toBeInstanceOf(PhaseOverlapError);

    expect(await service.listPhases(USER)).toHaveLength(1);
  });

  it('allows history before the current phase', async () => {
    const { service } = build();
    await service.createPhase(USER, request(lisbonInput));

    await expect(service.backfillPhases(USER, [middle])).resolves.toBeDefined();
  });
});

describe('deleting a phase', () => {
  it('removes it with its costs', async () => {
    const { service } = build();
    const { id } = await service.createPhase(USER, request(madridInput));

    await service.deletePhase(USER, id);

    expect(await service.listPhases(USER)).toEqual([]);
  });

  it('cannot delete what does not exist or belongs to someone else', async () => {
    const { service } = build();
    const { id } = await service.createPhase(USER, request(madridInput));

    await expect(service.deletePhase(USER, 'missing')).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.deletePhase(OTHER_USER, id)).rejects.toBeInstanceOf(ResourceNotFoundError);
    expect(await service.listPhases(USER)).toHaveLength(1);
  });
});

describe('fixed costs of a phase', () => {
  it('adds a cost, encrypted, and answers with its id', async () => {
    const { service, repository } = build();
    const { id: phaseId } = await service.createPhase(USER, request(lisbonInput));

    const { id } = await service.addFixedCost(USER, phaseId, {
      category: 'WATER',
      cadence: 'QUARTERLY',
      amountMinor: 4500,
      label: 'Águas de Lisboa',
    });

    const [phase] = await service.listPhases(USER);
    expect(phase.fixedCosts).toContainEqual(
      expect.objectContaining({ id, category: 'WATER', cadence: 'QUARTERLY', amountMinor: 4500, label: 'Águas de Lisboa' })
    );
    expect(JSON.stringify(repository.dump())).not.toContain('guas de');
  });

  it('changes only the fields that were sent', async () => {
    const { service } = build();
    const { id: phaseId } = await service.createPhase(USER, request(madridInput));
    const rent = (await service.listPhases(USER))[0].fixedCosts[0];

    await service.updateFixedCost(USER, phaseId, rent.id, { amountMinor: 125000 });
    await service.updateFixedCost(USER, phaseId, rent.id, { cadence: 'BIMONTHLY' });

    expect((await service.listPhases(USER))[0].fixedCosts[0]).toMatchObject({
      amountMinor: 125000,
      cadence: 'BIMONTHLY',
      label: 'Landlord Pérez',
      category: 'RENT',
    });
  });

  it('clears a label with null', async () => {
    const { service } = build();
    const { id: phaseId } = await service.createPhase(USER, request(madridInput));
    const rent = (await service.listPhases(USER))[0].fixedCosts[0];

    await service.updateFixedCost(USER, phaseId, rent.id, { label: null });

    expect((await service.listPhases(USER))[0].fixedCosts[0].label).toBeNull();
  });

  it('removes a cost', async () => {
    const { service } = build();
    const { id: phaseId } = await service.createPhase(USER, request(madridInput));
    const rent = (await service.listPhases(USER))[0].fixedCosts[0];

    await service.deleteFixedCost(USER, phaseId, rent.id);

    expect((await service.listPhases(USER))[0].fixedCosts.map((cost) => cost.category)).toEqual(['ELECTRICITY']);
  });

  it('cannot reach costs or phases that do not exist or belong to someone else', async () => {
    const { service } = build();
    const { id: phaseId } = await service.createPhase(USER, request(madridInput));
    const rent = (await service.listPhases(USER))[0].fixedCosts[0];
    const cost = { category: 'GAS', cadence: 'MONTHLY', amountMinor: 1000 } as const;

    await expect(service.addFixedCost(USER, 'missing', cost)).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.addFixedCost(OTHER_USER, phaseId, cost)).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.updateFixedCost(USER, phaseId, 'missing', { amountMinor: 1 })).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.updateFixedCost(OTHER_USER, phaseId, rent.id, { amountMinor: 1 })).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.deleteFixedCost(USER, phaseId, 'missing')).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.deleteFixedCost(OTHER_USER, phaseId, rent.id)).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});

describe('timeline', () => {
  it('is empty without phases', async () => {
    const { service } = build();

    expect(await service.timeline(USER, '2026-10-31')).toEqual({ asOf: '2026-10-31', entries: [] });
  });

  it('describes each chapter with its monthly figures and the details to show', async () => {
    const { service } = build();
    const { id: madrid } = await service.createPhase(USER, request(madridInput));
    const { id: lisbon } = await service.createPhase(USER, request(lisbonInput));

    const { asOf, entries } = await service.timeline(USER, '2026-10-31');

    expect(asOf).toBe('2026-10-31');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      phaseId: madrid,
      name: 'Madrid',
      city: 'Madrid',
      countryCode: 'ES',
      status: 'past',
      monthlyIncomeMinor: 320000,
      monthlyFixedCostsMinor: 124800,
      savingsCapacityMinor: 195200,
    });
    expect(entries[1]).toMatchObject({
      phaseId: lisbon,
      status: 'current',
      monthlyFixedCostsMinor: 90000,
      savingsCapacityMinor: 260000,
    });
  });

  it('judges past, current and upcoming by the day it is asked for', async () => {
    const { service } = build();
    await service.createPhase(USER, request(madridInput));
    await service.createPhase(USER, request(lisbonInput));

    const { entries } = await service.timeline(USER, '2023-06-01');

    expect(entries.map((entry) => entry.status)).toEqual(['current', 'upcoming']);
  });
});

describe('comparing two phases', () => {
  it('reports the change from the earlier phase to the later one', async () => {
    const { service } = build();
    const { id: madrid } = await service.createPhase(USER, request(madridInput));
    const { id: lisbon } = await service.createPhase(USER, request(lisbonInput));

    const result = await service.compare(USER, madrid, lisbon);

    expect(result).toEqual({
      comparable: true,
      fromPhaseId: madrid,
      toPhaseId: lisbon,
      currency: 'EUR',
      monthlyIncomeDeltaMinor: 30000,
      monthlyFixedCostsDeltaMinor: -34800,
      savingsCapacityDeltaMinor: 64800,
      fixedCostsDeltaFraction: -34800 / 124800,
      categories: [
        { category: 'RENT', fromMinor: 120000, toMinor: 90000, deltaMinor: -30000 },
        { category: 'ELECTRICITY', fromMinor: 4800, toMinor: 0, deltaMinor: -4800 },
      ],
    });
  });

  it('says exchange rates are needed when the phases use different currencies', async () => {
    const { service } = build();
    const { id: madrid } = await service.createPhase(USER, request(madridInput));
    const { id: buenosAires } = await service.createPhase(
      USER,
      request(lisbonInput, { name: 'Buenos Aires', city: 'Buenos Aires', countryCode: 'AR', currency: 'ARS' })
    );

    expect(await service.compare(USER, madrid, buenosAires)).toEqual({
      comparable: false,
      reason: 'FX_REQUIRED',
      currencies: ['EUR', 'ARS'],
    });
  });

  it('cannot compare phases that do not exist or belong to someone else', async () => {
    const { service } = build();
    const { id } = await service.createPhase(USER, request(madridInput));

    await expect(service.compare(USER, id, 'missing')).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.compare(OTHER_USER, id, id)).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
