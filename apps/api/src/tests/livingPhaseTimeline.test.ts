import { FIXED_COST_CATEGORIES } from '../contracts';
import { AVERAGE_DAYS_PER_MONTH } from '../domain/calendarDate';
import { InvalidLivingPhaseError } from '../domain/errors';
import {
  buildTimeline,
  createFixedCost,
  createLivingPhase,
  findConflicts,
  findOverlaps,
  phaseMonths,
  phaseStatus,
  type LivingPhase,
} from '../domain/livingPhase';

const phase = (overrides: Partial<LivingPhase> & { id: string }): LivingPhase => ({
  startDate: '2022-01-01',
  endDate: null,
  currency: 'EUR',
  monthlyIncomeMinor: 300000,
  fixedCosts: [],
  ...overrides,
});

describe('createFixedCost', () => {
  it('builds a cost from a whole, non-negative amount', () => {
    expect(createFixedCost({ id: 'c1', category: 'RENT', cadence: 'MONTHLY', amountMinor: 0 }).amountMinor).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects the amount %p', (amountMinor) => {
    expect(() => createFixedCost({ id: 'c1', category: 'RENT', cadence: 'MONTHLY', amountMinor })).toThrow(
      InvalidLivingPhaseError
    );
  });
});

describe('createLivingPhase', () => {
  const input = { id: 'p1', startDate: '2022-01-01', endDate: null, currency: 'EUR', monthlyIncomeMinor: 0, fixedCosts: [] };

  it('accepts a current phase, a one-day phase and zero income', () => {
    expect(createLivingPhase(input).endDate).toBeNull();
    expect(createLivingPhase({ ...input, endDate: '2022-01-01' }).endDate).toBe('2022-01-01');
  });

  it('rejects an end date before the start date', () => {
    expect(() => createLivingPhase({ ...input, endDate: '2021-12-31' })).toThrow(InvalidLivingPhaseError);
  });

  it.each([-1, 0.5, Number.NaN])('rejects the income %p', (monthlyIncomeMinor) => {
    expect(() => createLivingPhase({ ...input, monthlyIncomeMinor })).toThrow(InvalidLivingPhaseError);
  });

  it.each(['eur', 'EU', 'EURO', ''])('rejects the currency %p', (currency) => {
    expect(() => createLivingPhase({ ...input, currency })).toThrow(InvalidLivingPhaseError);
  });
});

describe('findOverlaps', () => {
  const range = (id: string, startDate: string, endDate: string | null) => ({ id, startDate, endDate });

  it('finds nothing when phases only touch (one ends the day before the next starts)', () => {
    expect(findOverlaps([range('a', '2022-01-01', '2022-03-31'), range('b', '2022-04-01', null)])).toEqual([]);
  });

  it.each<[string, ReturnType<typeof range>, ReturnType<typeof range>]>([
    ['sharing a single day', range('a', '2022-01-01', '2022-03-31'), range('b', '2022-03-31', '2022-06-30')],
    ['one inside the other', range('a', '2022-01-01', '2022-12-31'), range('b', '2022-03-01', '2022-04-30')],
    ['identical dates', range('a', '2022-01-01', '2022-12-31'), range('b', '2022-01-01', '2022-12-31')],
    ['an open-ended phase and a later one', range('a', '2022-01-01', null), range('b', '2023-05-01', '2023-06-01')],
    ['two open-ended phases', range('a', '2022-01-01', null), range('b', '2023-01-01', null)],
  ])('flags phases %s', (_label, first, second) => {
    expect(findOverlaps([first, second])).toEqual([['a', 'b']]);
  });

  it('reports every overlapping pair, earliest phase first, whatever the input order', () => {
    const phases = [
      range('c', '2022-06-01', '2022-09-30'),
      range('a', '2022-01-01', '2022-07-31'),
      range('b', '2022-05-01', '2022-12-31'),
    ];

    const expected = [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ];
    expect(findOverlaps(phases)).toEqual(expected);
    expect(findOverlaps([...phases].reverse())).toEqual(expected);
  });
});

describe('findConflicts', () => {
  const others = [
    { id: 'old', startDate: '2020-01-01', endDate: '2021-12-31' },
    { id: 'now', startDate: '2022-01-01', endDate: null },
  ];

  it('returns the ids of existing phases a candidate would overlap', () => {
    expect(findConflicts({ startDate: '2021-06-01', endDate: '2022-02-01' }, others)).toEqual(['old', 'now']);
    expect(findConflicts({ startDate: '2018-01-01', endDate: '2019-12-31' }, others)).toEqual([]);
  });

  it('ignores the phase being edited', () => {
    expect(findConflicts({ id: 'now', startDate: '2022-01-01', endDate: '2023-12-31' }, others)).toEqual([]);
  });
});

describe('phaseStatus', () => {
  const lived = phase({ id: 'p', startDate: '2022-01-01', endDate: '2022-12-31' });

  it.each([
    ['2021-12-31', 'upcoming'],
    ['2022-01-01', 'current'],
    ['2022-06-15', 'current'],
    ['2022-12-31', 'current'],
    ['2023-01-01', 'past'],
  ])('on %s a phase from 2022-01-01 to 2022-12-31 is %s', (asOf, expected) => {
    expect(phaseStatus(lived, asOf)).toBe(expected);
  });

  it('keeps an open-ended phase current forever after it starts', () => {
    expect(phaseStatus(phase({ id: 'p', startDate: '2022-01-01' }), '2040-01-01')).toBe('current');
  });
});

describe('phaseMonths', () => {
  it('is zero for a phase that has not started', () => {
    expect(phaseMonths(phase({ id: 'p', startDate: '2030-01-01' }), '2029-12-31')).toBe(0);
  });

  it('counts a single day as one day of an average month', () => {
    expect(phaseMonths(phase({ id: 'p', startDate: '2022-05-05', endDate: '2022-05-05' }), '2022-05-05')).toBeCloseTo(
      1 / AVERAGE_DAYS_PER_MONTH,
      10
    );
  });

  it('counts a current phase up to the as-of day, inclusive', () => {
    expect(phaseMonths(phase({ id: 'p', startDate: '2024-01-01' }), '2024-01-31')).toBeCloseTo(31 / AVERAGE_DAYS_PER_MONTH, 10);
  });

  it('stops counting at the end date of a finished phase', () => {
    const finished = phase({ id: 'p', startDate: '2024-01-01', endDate: '2024-02-29' }); // leap February: 60 days

    expect(phaseMonths(finished, '2030-01-01')).toBeCloseTo(60 / AVERAGE_DAYS_PER_MONTH, 10);
  });
});

describe('buildTimeline', () => {
  const madrid = phase({
    id: 'madrid',
    startDate: '2022-09-01',
    endDate: '2024-08-31',
    monthlyIncomeMinor: 300000,
    fixedCosts: [
      { id: 'c1', category: 'RENT', cadence: 'MONTHLY', amountMinor: 120000 },
      { id: 'c2', category: 'ELECTRICITY', cadence: 'BIMONTHLY', amountMinor: 9600 },
    ],
  });
  const lisbon = phase({
    id: 'lisbon',
    startDate: '2024-09-01',
    endDate: null,
    monthlyIncomeMinor: 350000,
    fixedCosts: [{ id: 'c3', category: 'RENT', cadence: 'MONTHLY', amountMinor: 90000 }],
  });

  it('is empty without phases', () => {
    expect(buildTimeline([], '2026-10-31')).toEqual([]);
  });

  it('lists phases oldest first, with their monthly burn, savings capacity and status', () => {
    const entries = buildTimeline([lisbon, madrid], '2026-10-31');

    expect(entries.map((entry) => entry.phaseId)).toEqual(['madrid', 'lisbon']);
    expect(entries[0]).toMatchObject({
      status: 'past',
      currency: 'EUR',
      monthlyIncomeMinor: 300000,
      monthlyFixedCostsMinor: 124800, // 120,000 + 9,600 / 2
      savingsCapacityMinor: 175200,
    });
    expect(entries[0].savingsRate).toBeCloseTo(175200 / 300000, 10);
    expect(entries[1]).toMatchObject({ status: 'current', monthlyFixedCostsMinor: 90000, savingsCapacityMinor: 260000 });
  });

  it('breaks the burn down by category, with every category present', () => {
    const [entry] = buildTimeline([madrid], '2026-10-31');

    expect(Object.keys(entry.fixedCostsByCategoryMinor)).toEqual([...FIXED_COST_CATEGORIES]);
    expect(entry.fixedCostsByCategoryMinor.RENT).toBe(120000);
    expect(entry.fixedCostsByCategoryMinor.ELECTRICITY).toBe(4800);
  });

  it('totals income and costs over the months lived, and none for an upcoming phase', () => {
    const [past, current] = buildTimeline([madrid, lisbon], '2026-10-31');
    const upcoming = buildTimeline([phase({ id: 'future', startDate: '2030-01-01', monthlyIncomeMinor: 100 })], '2026-10-31')[0];

    expect(past.months).toBeCloseTo(731 / AVERAGE_DAYS_PER_MONTH, 10); // 2022-09-01 to 2024-08-31 spans leap day 2024-02-29
    expect(past.totalIncomeMinor).toBe(Math.round(300000 * past.months));
    expect(current.totalFixedCostsMinor).toBe(Math.round(90000 * current.months));
    expect(upcoming).toMatchObject({ status: 'upcoming', months: 0, totalIncomeMinor: 0, totalFixedCostsMinor: 0 });
  });

  it('puts phases that start the same day in a stable order', () => {
    const a = phase({ id: 'a', startDate: '2022-01-01', endDate: '2022-01-01' });
    const b = phase({ id: 'b', startDate: '2022-01-01', endDate: '2022-01-01' });

    expect(buildTimeline([b, a], '2026-01-01').map((entry) => entry.phaseId)).toEqual(['a', 'b']);
  });

  it('does not mutate the phases it is given', () => {
    const frozen = Object.freeze({ ...madrid, fixedCosts: Object.freeze([...madrid.fixedCosts]) });

    expect(() => buildTimeline([frozen], '2026-10-31')).not.toThrow();
  });
});

describe('determinism', () => {
  const lived = phase({ id: 'p', startDate: '2022-09-01', endDate: '2023-08-31', monthlyIncomeMinor: 250000 });

  it('does not depend on the system clock', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('1999-01-01T00:00:00Z'));
    const early = buildTimeline([lived], '2026-10-31');
    jest.setSystemTime(new Date('2040-12-31T00:00:00Z'));

    expect(buildTimeline([lived], '2026-10-31')).toEqual(early);
    jest.useRealTimers();
  });

  it('never reads host-local calendar fields', () => {
    const expected = buildTimeline([lived], '2026-10-31');
    (['getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours'] as const).forEach((method) => {
      jest.spyOn(Date.prototype, method).mockImplementation(() => {
        throw new Error(`${method} depends on the host time zone`);
      });
    });

    expect(buildTimeline([lived], '2026-10-31')).toEqual(expected);
  });
});
