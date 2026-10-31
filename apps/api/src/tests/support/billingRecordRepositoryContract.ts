import type { BillingRecordRepository, LivingPhaseRepository, StoredBillingRecord, StoredLivingPhase } from '../../application/ports';

export interface BillingHarness {
  readonly repository: BillingRecordRepository;
  /** Used to set up phases (bills belong to one) and to delete them. */
  readonly phases: LivingPhaseRepository;
  readonly userA: string;
  readonly userB: string;
  readonly teardown?: () => Promise<void>;
}

const phase = (id: string): StoredLivingPhase => ({
  id,
  startDate: '2022-01-01',
  endDate: null,
  currency: 'EUR',
  countryCode: 'ES',
  tenure: 'RENT',
  payload: `sealed-${id}`,
  fixedCosts: [],
});

const record = (id: string, phaseId: string, overrides: Partial<StoredBillingRecord> = {}): StoredBillingRecord => ({
  id,
  phaseId,
  category: 'ELECTRICITY',
  cadence: 'BIMONTHLY',
  periodStart: '2026-07-15',
  periodEnd: '2026-09-14',
  payload: `sealed-${id}`,
  fingerprint: `fp-${id}`,
  ...overrides,
});

/** The behaviour every BillingRecordRepository must have, run against the in-memory and the Prisma one. */
export function billingRecordRepositoryContract(name: string, setup: () => Promise<BillingHarness>): void {
  describe(`BillingRecordRepository contract: ${name}`, () => {
    let harness: BillingHarness;

    beforeEach(async () => {
      harness = await setup();
      await harness.phases.createMany(harness.userA, [phase('home-a'), { ...phase('home-a2'), startDate: '2030-01-01' }]);
      await harness.phases.createMany(harness.userB, [phase('home-b')]);
    });

    afterEach(async () => {
      await harness.teardown?.();
    });

    it('starts empty', async () => {
      expect(await harness.repository.list(harness.userA)).toEqual([]);
    });

    it('stores a bill and reads it back unchanged, dates included', async () => {
      const bill = record('r1', 'home-a', { periodStart: '2024-02-29', periodEnd: '2024-04-28' });

      expect(await harness.repository.create(harness.userA, bill)).toBe('created');

      expect(await harness.repository.find(harness.userA, 'r1')).toEqual(bill);
    });

    it('lists the newest period first, with a stable order for equal starts', async () => {
      for (const [id, start] of [['b', '2026-01-01'], ['a', '2026-05-01'], ['d', '2026-03-01'], ['c', '2026-03-01']]) {
        await harness.repository.create(harness.userA, record(id, 'home-a', { periodStart: start, periodEnd: '2026-06-30' }));
      }

      expect((await harness.repository.list(harness.userA)).map((r) => r.id)).toEqual(['a', 'c', 'd', 'b']);
    });

    it('can list the bills of one phase only', async () => {
      await harness.repository.create(harness.userA, record('r1', 'home-a'));
      await harness.repository.create(harness.userA, record('r2', 'home-a2'));

      expect((await harness.repository.list(harness.userA, { phaseId: 'home-a2' })).map((r) => r.id)).toEqual(['r2']);
    });

    it('refuses a bill for a phase that does not exist or belongs to someone else', async () => {
      expect(await harness.repository.create(harness.userA, record('r1', 'nope'))).toBe('phase-missing');
      expect(await harness.repository.create(harness.userA, record('r2', 'home-b'))).toBe('phase-missing');
      expect(await harness.repository.list(harness.userA)).toEqual([]);
    });

    it('keeps users apart', async () => {
      await harness.repository.create(harness.userA, record('mine', 'home-a'));

      expect(await harness.repository.list(harness.userB)).toEqual([]);
      expect(await harness.repository.find(harness.userB, 'mine')).toBeNull();
      expect(await harness.repository.update(harness.userB, 'mine', { payload: 'hacked' })).toBe('missing');
      expect(await harness.repository.delete(harness.userB, 'mine')).toBe(false);
      expect((await harness.repository.find(harness.userA, 'mine'))?.payload).toBe('sealed-mine');
    });

    it('changes only the fields that are given', async () => {
      await harness.repository.create(harness.userA, record('r1', 'home-a'));

      expect(await harness.repository.update(harness.userA, 'r1', { cadence: 'ONE_OFF', periodEnd: '2026-07-15', payload: 'sealed-new' })).toBe('updated');

      expect(await harness.repository.find(harness.userA, 'r1')).toEqual(
        record('r1', 'home-a', { cadence: 'ONE_OFF', periodEnd: '2026-07-15', payload: 'sealed-new' })
      );
      expect(await harness.repository.update(harness.userA, 'nope', { payload: 'x' })).toBe('missing');
    });

    it('refuses a second bill with the same fingerprint for the same person, and says which one it is', async () => {
      await harness.repository.create(harness.userA, record('first', 'home-a', { fingerprint: 'same' }));

      expect(await harness.repository.create(harness.userA, record('second', 'home-a', { fingerprint: 'same' }))).toBe('duplicate');

      expect(await harness.repository.find(harness.userA, 'second')).toBeNull();
      expect(await harness.repository.findIdByFingerprint(harness.userA, 'same')).toBe('first');
      expect(await harness.repository.findIdByFingerprint(harness.userA, 'other')).toBeNull();
    });

    it('lets two people hold the same fingerprint, and never reveals one person’s bill to another', async () => {
      await harness.repository.create(harness.userA, record('mine', 'home-a', { fingerprint: 'same' }));

      expect(await harness.repository.create(harness.userB, record('theirs', 'home-b', { fingerprint: 'same' }))).toBe('created');
      expect(await harness.repository.findIdByFingerprint(harness.userB, 'same')).toBe('theirs');
    });

    it('allows any number of bills without a fingerprint', async () => {
      expect(await harness.repository.create(harness.userA, record('r1', 'home-a', { fingerprint: null }))).toBe('created');
      expect(await harness.repository.create(harness.userA, record('r2', 'home-a', { fingerprint: null }))).toBe('created');
    });

    it('refuses a change that would make a bill a duplicate of another, and lets a bill keep its own fingerprint', async () => {
      await harness.repository.create(harness.userA, record('r1', 'home-a', { fingerprint: 'one' }));
      await harness.repository.create(harness.userA, record('r2', 'home-a', { fingerprint: 'two' }));

      expect(await harness.repository.update(harness.userA, 'r2', { fingerprint: 'one' })).toBe('duplicate');
      expect(await harness.repository.update(harness.userA, 'r1', { fingerprint: 'one', payload: 'sealed-new' })).toBe('updated');
      expect((await harness.repository.find(harness.userA, 'r2'))?.fingerprint).toBe('two');
    });

    it('frees the fingerprint when a bill is deleted', async () => {
      await harness.repository.create(harness.userA, record('r1', 'home-a', { fingerprint: 'one' }));
      await harness.repository.delete(harness.userA, 'r1');

      expect(await harness.repository.create(harness.userA, record('r2', 'home-a', { fingerprint: 'one' }))).toBe('created');
    });

    it('deletes a bill', async () => {
      await harness.repository.create(harness.userA, record('r1', 'home-a'));

      expect(await harness.repository.delete(harness.userA, 'r1')).toBe(true);

      expect(await harness.repository.find(harness.userA, 'r1')).toBeNull();
      expect(await harness.repository.delete(harness.userA, 'r1')).toBe(false);
    });

    it('loses its bills when a phase is deleted', async () => {
      await harness.repository.create(harness.userA, record('r1', 'home-a'));
      await harness.repository.create(harness.userA, record('r2', 'home-a2'));

      await harness.phases.delete(harness.userA, 'home-a');

      expect((await harness.repository.list(harness.userA)).map((r) => r.id)).toEqual(['r2']);
    });
  });
}
