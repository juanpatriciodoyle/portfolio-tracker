import type { LivingPhaseRepository, StoredFixedCost, StoredLivingPhase } from '../../application/ports';

export interface RepositoryHarness {
  readonly repository: LivingPhaseRepository;
  /** Two distinct users that exist in whatever store backs the repository. */
  readonly userA: string;
  readonly userB: string;
  readonly teardown?: () => Promise<void>;
}

const cost = (id: string, overrides: Partial<StoredFixedCost> = {}): StoredFixedCost => ({
  id,
  category: 'RENT',
  cadence: 'MONTHLY',
  payload: `sealed-${id}`,
  ...overrides,
});

const phase = (id: string, overrides: Partial<StoredLivingPhase> = {}): StoredLivingPhase => ({
  id,
  startDate: '2022-09-01',
  endDate: '2024-08-31',
  currency: 'EUR',
  countryCode: 'ES',
  tenure: 'RENT',
  payload: `sealed-${id}`,
  fixedCosts: [],
  ...overrides,
});

/**
 * The behaviour every LivingPhaseRepository must have. It runs against the in-memory repository on
 * every test run and against the Prisma repository when a test database is available, so the fast
 * fake can be trusted to behave like the real thing.
 */
export function livingPhaseRepositoryContract(name: string, setup: () => Promise<RepositoryHarness>): void {
  describe(`LivingPhaseRepository contract: ${name}`, () => {
    let harness: RepositoryHarness;

    beforeEach(async () => {
      harness = await setup();
    });

    afterEach(async () => {
      await harness.teardown?.();
    });

    it('starts empty for a user', async () => {
      expect(await harness.repository.list(harness.userA)).toEqual([]);
    });

    it('stores phases with their costs and reads them back unchanged', async () => {
      const original = phase('p1', {
        fixedCosts: [cost('c1'), cost('c2', { category: 'ELECTRICITY', cadence: 'BIMONTHLY' })],
      });

      await harness.repository.createMany(harness.userA, [original]);

      expect(await harness.repository.find(harness.userA, 'p1')).toEqual(original);
    });

    it('round-trips calendar dates exactly, including a leap day and an open end', async () => {
      await harness.repository.createMany(harness.userA, [
        phase('leap', { startDate: '2024-02-29', endDate: null }),
        phase('edge', { startDate: '2020-12-31', endDate: '2021-01-01' }),
      ]);

      expect((await harness.repository.find(harness.userA, 'leap'))?.startDate).toBe('2024-02-29');
      expect((await harness.repository.find(harness.userA, 'leap'))?.endDate).toBeNull();
      expect((await harness.repository.find(harness.userA, 'edge'))?.endDate).toBe('2021-01-01');
    });

    it('lists the oldest phase first, with a stable order for equal start dates', async () => {
      await harness.repository.createMany(harness.userA, [
        phase('b', { startDate: '2023-01-01', endDate: null }),
        phase('a', { startDate: '2020-01-01', endDate: '2022-12-31' }),
        phase('d', { startDate: '2019-01-01', endDate: '2019-01-01' }),
        phase('c', { startDate: '2019-01-01', endDate: '2019-01-01' }),
      ]);

      expect((await harness.repository.list(harness.userA)).map((p) => p.id)).toEqual(['c', 'd', 'a', 'b']);
    });

    it('keeps users apart: nobody sees, changes or removes another user’s phases', async () => {
      await harness.repository.createMany(harness.userA, [phase('mine', { fixedCosts: [cost('c1')] })]);

      expect(await harness.repository.list(harness.userB)).toEqual([]);
      expect(await harness.repository.find(harness.userB, 'mine')).toBeNull();
      expect(await harness.repository.update(harness.userB, 'mine', { payload: 'hacked' })).toBe(false);
      expect(await harness.repository.delete(harness.userB, 'mine')).toBe(false);
      expect(await harness.repository.addFixedCost(harness.userB, 'mine', cost('c9'))).toBe(false);
      expect(await harness.repository.updateFixedCost(harness.userB, 'mine', 'c1', { payload: 'hacked' })).toBe(false);
      expect(await harness.repository.deleteFixedCost(harness.userB, 'mine', 'c1')).toBe(false);
      expect(await harness.repository.find(harness.userA, 'mine')).toEqual(
        phase('mine', { fixedCosts: [cost('c1')] })
      );
    });

    it('saves a batch all-or-nothing', async () => {
      await harness.repository.createMany(harness.userA, [phase('existing')]);

      await expect(
        harness.repository.createMany(harness.userA, [phase('fresh'), phase('existing')])
      ).rejects.toThrow();

      expect((await harness.repository.list(harness.userA)).map((p) => p.id)).toEqual(['existing']);
    });

    it('updates only the fields that are given, and can clear the end date', async () => {
      await harness.repository.createMany(harness.userA, [phase('p1')]);

      expect(await harness.repository.update(harness.userA, 'p1', { currency: 'USD', payload: 'sealed-new' })).toBe(true);
      expect(await harness.repository.find(harness.userA, 'p1')).toEqual(
        phase('p1', { currency: 'USD', payload: 'sealed-new' })
      );

      expect(await harness.repository.update(harness.userA, 'p1', { endDate: null })).toBe(true);
      expect((await harness.repository.find(harness.userA, 'p1'))?.endDate).toBeNull();
    });

    it('answers false for phases that do not exist', async () => {
      expect(await harness.repository.update(harness.userA, 'nope', { payload: 'x' })).toBe(false);
      expect(await harness.repository.delete(harness.userA, 'nope')).toBe(false);
      expect(await harness.repository.addFixedCost(harness.userA, 'nope', cost('c1'))).toBe(false);
    });

    it('deletes a phase together with its costs', async () => {
      await harness.repository.createMany(harness.userA, [phase('p1', { fixedCosts: [cost('c1')] })]);

      expect(await harness.repository.delete(harness.userA, 'p1')).toBe(true);

      expect(await harness.repository.find(harness.userA, 'p1')).toBeNull();
      expect(await harness.repository.list(harness.userA)).toEqual([]);
    });

    it('adds, changes and removes a fixed cost', async () => {
      await harness.repository.createMany(harness.userA, [phase('p1')]);

      expect(await harness.repository.addFixedCost(harness.userA, 'p1', cost('c1'))).toBe(true);
      expect(
        await harness.repository.updateFixedCost(harness.userA, 'p1', 'c1', { cadence: 'ANNUAL', payload: 'sealed-new' })
      ).toBe(true);
      expect((await harness.repository.find(harness.userA, 'p1'))?.fixedCosts).toEqual([
        cost('c1', { cadence: 'ANNUAL', payload: 'sealed-new' }),
      ]);

      expect(await harness.repository.deleteFixedCost(harness.userA, 'p1', 'c1')).toBe(true);
      expect((await harness.repository.find(harness.userA, 'p1'))?.fixedCosts).toEqual([]);
    });

    it('does not touch a cost through the wrong phase', async () => {
      await harness.repository.createMany(harness.userA, [
        phase('p1', { fixedCosts: [cost('c1')] }),
        phase('p2', { startDate: '2025-01-01', endDate: null }),
      ]);

      expect(await harness.repository.updateFixedCost(harness.userA, 'p2', 'c1', { payload: 'x' })).toBe(false);
      expect(await harness.repository.deleteFixedCost(harness.userA, 'p2', 'c1')).toBe(false);
      expect((await harness.repository.find(harness.userA, 'p1'))?.fixedCosts).toEqual([cost('c1')]);
    });
  });
}
