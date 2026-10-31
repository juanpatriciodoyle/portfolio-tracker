import { BillingRecordService } from '../application/billingRecordService';
import { ResourceNotFoundError } from '../application/errors';
import { LivingPhaseService } from '../application/livingPhaseService';
import { createLivingPhaseRequest, trendsResponse, type CreateBillingRecordRequest } from '../contracts';
import { DuplicateBillingRecordError, InvalidBillingRecordError } from '../domain/errors';
import { HmacBillFingerprinter } from '../infrastructure/hmacBillFingerprinter';
import { AesGcmFieldCipher, FieldCipherError } from '../infrastructure/aesGcmFieldCipher';
import { InMemoryBillingRecordRepository, InMemoryLivingPhaseRepository } from './support/inMemoryRepositories';

const USER = 'user-1';
const OTHER_USER = 'user-2';

function build() {
  const phaseRepository = new InMemoryLivingPhaseRepository();
  const billRepository = new InMemoryBillingRecordRepository(phaseRepository);
  let ids = 0;
  let iv = 0;
  const cipher = new AesGcmFieldCipher(Buffer.alloc(32, 6), (size) => Buffer.alloc(size, (++iv % 250) + 1));
  const newId = () => `id-${++ids}`;
  const phases = new LivingPhaseService({ repository: phaseRepository, cipher, newId });
  const fingerprinter = new HmacBillFingerprinter(Buffer.alloc(32, 9));
  const service = new BillingRecordService({ repository: billRepository, phases, cipher, fingerprinter, newId });
  return { service, phases, billRepository, phaseRepository };
}

const madridPhase = createLivingPhaseRequest.parse({
  name: 'Madrid',
  city: 'Madrid',
  countryCode: 'ES',
  tenure: 'RENT',
  startDate: '2022-09-01',
  currency: 'EUR',
  monthlyIncomeMinor: 320000,
  fixedCosts: [
    { category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000 },
    { category: 'ELECTRICITY', cadence: 'BIMONTHLY', amountMinor: 9600 },
  ],
});

const electricity = (phaseId: string, change: Partial<CreateBillingRecordRequest> = {}): CreateBillingRecordRequest => ({
  phaseId,
  category: 'ELECTRICITY',
  cadence: 'BIMONTHLY',
  periodStart: '2026-07-15',
  periodEnd: '2026-09-14',
  amountMinor: 987654,
  vendor: 'Iberdrola Clientes',
  notes: undefined,
  ...change,
});

async function withMadrid() {
  const world = build();
  const { id: phaseId } = await world.phases.createPhase(USER, madridPhase);
  return { ...world, phaseId };
}

describe('recording bills', () => {
  it('answers with the new id only, and lists the bill decrypted with its phase currency', async () => {
    const { service, phaseId } = await withMadrid();

    const created = await service.createRecord(USER, electricity(phaseId, { notes: 'Final reading' }));
    const { records } = await service.listRecords(USER);

    expect(Object.keys(created)).toEqual(['id']);
    expect(records).toEqual([
      {
        id: created.id,
        phaseId,
        category: 'ELECTRICITY',
        cadence: 'BIMONTHLY',
        periodStart: '2026-07-15',
        periodEnd: '2026-09-14',
        amountMinor: 987654,
        vendor: 'Iberdrola Clientes',
        notes: 'Final reading',
        currency: 'EUR',
      },
    ]);
  });

  it('keeps the vendor, the amount and the notes out of readable storage', async () => {
    const { service, billRepository, phaseId } = await withMadrid();
    await service.createRecord(USER, electricity(phaseId, { notes: 'Meter in the hallway' }));

    const stored = JSON.stringify(billRepository.dump());

    for (const secret of ['Iberdrola', 'Clientes', '987654', 'hallway']) expect(stored).not.toContain(secret);
    expect(stored).toContain('2026-07-15');
  });

  it('lists the newest period first and can filter by phase', async () => {
    const { service, phases, phaseId } = await withMadrid();
    await service.createRecord(USER, electricity(phaseId, { periodStart: '2026-01-01', periodEnd: '2026-02-28', vendor: 'Older' }));
    await service.createRecord(USER, electricity(phaseId, { vendor: 'Newer' }));
    const { id: other } = await phases.createPhase(USER, { ...madridPhase, startDate: '2020-01-01', endDate: '2022-08-31', fixedCosts: [] });
    await service.createRecord(USER, electricity(other, { vendor: 'Elsewhere', periodStart: '2026-08-01', periodEnd: '2026-08-31' }));

    expect((await service.listRecords(USER)).records.map((r) => r.vendor)).toEqual(['Elsewhere', 'Newer', 'Older']);
    expect((await service.listRecords(USER, { phaseId })).records.map((r) => r.vendor)).toEqual(['Newer', 'Older']);
  });

  it('cannot record a bill for a phase that is missing or someone else’s', async () => {
    const { service, phaseId } = await withMadrid();

    await expect(service.createRecord(USER, electricity('missing'))).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.createRecord(OTHER_USER, electricity(phaseId))).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('rejects a bill that breaks a business rule', async () => {
    const { service, phaseId } = await withMadrid();

    await expect(service.createRecord(USER, electricity(phaseId, { periodStart: '2023-01-01', periodEnd: '2026-01-01' }))).rejects.toBeInstanceOf(
      InvalidBillingRecordError
    );
  });

  it('shows nobody else’s bills', async () => {
    const { service, phaseId } = await withMadrid();
    await service.createRecord(USER, electricity(phaseId));

    expect((await service.listRecords(OTHER_USER)).records).toEqual([]);
  });

  it('refuses to read a bill whose stored data was tampered with', async () => {
    const { service, billRepository, phaseId } = await withMadrid();
    const { id } = await service.createRecord(USER, electricity(phaseId));
    billRepository.corruptPayload(id);

    await expect(service.listRecords(USER)).rejects.toThrow(FieldCipherError);
  });
});

describe('duplicate bills', () => {
  it('refuses the same bill twice, naming the one already recorded', async () => {
    const { service, phaseId } = await withMadrid();
    const { id } = await service.createRecord(USER, electricity(phaseId));

    const second = service.createRecord(USER, electricity(phaseId, { vendor: '  IBERDROLA clientes ' }));

    await expect(second).rejects.toBeInstanceOf(DuplicateBillingRecordError);
    await expect(second).rejects.toMatchObject({ existingRecordId: id });
    expect((await service.listRecords(USER)).records).toHaveLength(1);
  });

  it('accepts bills that differ in any of vendor, amount, period, category or phase', async () => {
    const { service, phases, phaseId } = await withMadrid();
    await service.createRecord(USER, electricity(phaseId));
    const { id: otherPhase } = await phases.createPhase(USER, { ...madridPhase, startDate: '2020-01-01', endDate: '2022-08-31', fixedCosts: [] });

    for (const change of [{ vendor: 'Endesa' }, { amountMinor: 1 }, { periodEnd: '2026-09-15' }, { category: 'GAS' as const }, { phaseId: otherPhase }]) {
      await expect(service.createRecord(USER, electricity(phaseId, change))).resolves.toHaveProperty('id');
    }
  });

  it('lets two people record the same bill', async () => {
    const { service, phases, phaseId } = await withMadrid();
    const { id: theirPhase } = await phases.createPhase(OTHER_USER, madridPhase);
    await service.createRecord(USER, electricity(phaseId));

    await expect(service.createRecord(OTHER_USER, electricity(theirPhase))).resolves.toHaveProperty('id');
  });

  it('does not leak that someone else recorded a bill', async () => {
    const { service, phases, phaseId } = await withMadrid();
    const { id: theirPhase } = await phases.createPhase(OTHER_USER, madridPhase);
    await service.createRecord(OTHER_USER, electricity(theirPhase));

    await expect(service.createRecord(USER, electricity(phaseId))).resolves.toHaveProperty('id');
  });

  it('refuses a correction that turns a bill into a copy of another, and accepts one that keeps it distinct', async () => {
    const { service, phaseId } = await withMadrid();
    const { id: first } = await service.createRecord(USER, electricity(phaseId));
    const { id: second } = await service.createRecord(USER, electricity(phaseId, { amountMinor: 5 }));

    await expect(service.updateRecord(USER, second, { amountMinor: 987654 })).rejects.toMatchObject({ existingRecordId: first });
    await expect(service.updateRecord(USER, second, { amountMinor: 6 })).resolves.toBeUndefined();
    await expect(service.updateRecord(USER, first, { notes: 'just a note' })).resolves.toBeUndefined();
  });

  it('keeps the vendor, amount and period out of the stored fingerprint', async () => {
    const { service, billRepository, phaseId } = await withMadrid();
    await service.createRecord(USER, electricity(phaseId));

    const stored = JSON.stringify(billRepository.dump());

    expect(stored).toContain('fingerprint');
    expect(stored).not.toMatch(/"fingerprint":"[^"]*(iberdrola|987654)/i);
  });
});

describe('changing and removing bills', () => {
  it('changes only what was sent and clears notes with null', async () => {
    const { service, phaseId } = await withMadrid();
    const { id } = await service.createRecord(USER, electricity(phaseId, { notes: 'x' }));

    await service.updateRecord(USER, id, { amountMinor: 1000, notes: null });

    expect((await service.listRecords(USER)).records[0]).toMatchObject({
      amountMinor: 1000,
      notes: null,
      vendor: 'Iberdrola Clientes',
      periodStart: '2026-07-15',
    });
  });

  it('checks the whole bill after the change', async () => {
    const { service, phaseId } = await withMadrid();
    const { id } = await service.createRecord(USER, electricity(phaseId));

    await expect(service.updateRecord(USER, id, { periodEnd: '2026-07-01' })).rejects.toBeInstanceOf(InvalidBillingRecordError);
  });

  it('removes a bill, and a deleted phase takes its bills with it', async () => {
    const { service, phases, phaseId } = await withMadrid();
    const { id } = await service.createRecord(USER, electricity(phaseId));
    await service.createRecord(USER, electricity(phaseId, { vendor: 'Second' }));

    await service.deleteRecord(USER, id);
    expect((await service.listRecords(USER)).records.map((r) => r.vendor)).toEqual(['Second']);

    await phases.deletePhase(USER, phaseId);
    expect((await service.listRecords(USER)).records).toEqual([]);
  });

  it('cannot reach bills that do not exist or belong to someone else', async () => {
    const { service, phaseId } = await withMadrid();
    const { id } = await service.createRecord(USER, electricity(phaseId));

    await expect(service.updateRecord(USER, 'missing', { amountMinor: 1 })).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.updateRecord(OTHER_USER, id, { amountMinor: 1 })).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.deleteRecord(USER, 'missing')).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(service.deleteRecord(OTHER_USER, id)).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});

describe('trends', () => {
  it('is empty without bills', async () => {
    const { service } = await withMadrid();

    expect(await service.trends(USER, '2026-10-31')).toEqual({ asOf: '2026-10-31', lastCompleteMonth: '2026-09', fixedCosts: [], subscriptions: [], phases: [] });
  });

  it('averages the bills and compares them with what was declared, naming the phase', async () => {
    const { service, phaseId } = await withMadrid();
    for (const [start, end] of [['2026-07-01', '2026-07-31'], ['2026-08-01', '2026-08-31'], ['2026-09-01', '2026-09-30']]) {
      await service.createRecord(USER, electricity(phaseId, { category: 'RENT', cadence: 'MONTHLY', periodStart: start, periodEnd: end, amountMinor: 120000 }));
    }
    await service.createRecord(USER, electricity(phaseId, { category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-09-30', amountMinor: 1299 }));

    const trends = trendsResponse.parse(await service.trends(USER, '2026-10-31'));

    expect(trends.fixedCosts[0]).toMatchObject({ currency: 'EUR', windows: [{ windowMonths: 3, totalMinor: 360000, coveredMonths: 3, averageMinor: 120000 }, expect.anything(), expect.anything()] });
    expect(trends.subscriptions[0].windows[0]).toMatchObject({ coveredMonths: 1, averageMinor: 1299 });
    expect(trends.phases).toHaveLength(1);
    expect(trends.phases[0]).toMatchObject({ phaseId, name: 'Madrid', declaredMonthlyMinor: 124800, coveredMonths: 3 });
  });
});
