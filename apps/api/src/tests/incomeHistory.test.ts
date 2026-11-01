import { AVERAGE_DAYS_PER_MONTH } from '../domain/calendarDate';
import { InvalidLivingPhaseError } from '../domain/errors';
import { activeIncomeMinor, earnedIncomeMinor, type IncomeChange } from '../domain/income';
import { buildTimeline, createLivingPhase, phaseSnapshot, type LivingPhase } from '../domain/livingPhase';

const change = (startDate: string, endDate: string | null, amountMinor: number, reason: IncomeChange['reason'] = null): IncomeChange => ({
  startDate,
  endDate,
  amountMinor,
  reason,
});

const phase = (overrides: Partial<LivingPhase> = {}): LivingPhase => ({
  id: 'p1',
  startDate: '2026-01-01',
  endDate: null,
  currency: 'EUR',
  monthlyIncomeMinor: 300000,
  fixedCosts: [],
  ...overrides,
});

describe('activeIncomeMinor', () => {
  const income = { baseMinor: 300000, changes: [change('2026-04-01', null, 350000, 'PROMOTION')] };

  it('is the base income before any change and the changed income from its first day', () => {
    expect(activeIncomeMinor(income, '2026-03-31')).toBe(300000);
    expect(activeIncomeMinor(income, '2026-04-01')).toBe(350000);
    expect(activeIncomeMinor(income, '2030-01-01')).toBe(350000);
  });

  it('stops a change on its end date and falls back to the base income', () => {
    const temporary = { baseMinor: 300000, changes: [change('2026-04-01', '2026-06-30', 0, 'UNEMPLOYMENT')] };
    expect(activeIncomeMinor(temporary, '2026-06-30')).toBe(0);
    expect(activeIncomeMinor(temporary, '2026-07-01')).toBe(300000);
  });

  it('lets the change that started last win when ranges overlap, whatever the order they are listed in', () => {
    const changes = [change('2026-05-01', null, 400000), change('2026-03-01', null, 320000)];
    expect(activeIncomeMinor({ baseMinor: 1, changes }, '2026-04-15')).toBe(320000);
    expect(activeIncomeMinor({ baseMinor: 1, changes }, '2026-05-01')).toBe(400000);
  });

  it('is the base income when nothing changed', () => {
    expect(activeIncomeMinor({ baseMinor: 123, changes: [] }, '2026-04-15')).toBe(123);
  });
});

describe('earnedIncomeMinor', () => {
  const span = { startDate: '2026-01-01', endDate: null };

  it('matches the old maths when nothing changed: the monthly income for every month lived', () => {
    const days = 100;
    expect(earnedIncomeMinor({ ...span, baseMinor: 300000, changes: [] }, '2026-04-10')).toBe(Math.round((300000 * days) / AVERAGE_DAYS_PER_MONTH));
  });

  it('adds each stretch of income for the days it was earned', () => {
    // 90 days at 300000 (Jan-Mar), then 30 days at 350000 (Apr 1-30).
    const earned = earnedIncomeMinor({ ...span, baseMinor: 300000, changes: [change('2026-04-01', null, 350000)] }, '2026-04-30');
    expect(earned).toBe(Math.round((300000 * 90 + 350000 * 30) / AVERAGE_DAYS_PER_MONTH));
  });

  it('counts unemployment at zero for its own days only', () => {
    const earned = earnedIncomeMinor(
      { ...span, baseMinor: 300000, changes: [change('2026-02-01', '2026-02-28', 0, 'UNEMPLOYMENT')] },
      '2026-03-31'
    );
    expect(earned).toBe(Math.round((300000 * (31 + 31)) / AVERAGE_DAYS_PER_MONTH));
  });

  it('stops counting at the day the phase ends and at the as-of day', () => {
    const base = { baseMinor: 300000, changes: [change('2026-04-01', null, 350000)] };
    const ended = earnedIncomeMinor({ startDate: '2026-01-01', endDate: '2026-04-30', ...base }, '2030-01-01');
    expect(ended).toBe(Math.round((300000 * 90 + 350000 * 30) / AVERAGE_DAYS_PER_MONTH));
    expect(earnedIncomeMinor({ ...span, ...base }, '2026-03-31')).toBe(Math.round((300000 * 90) / AVERAGE_DAYS_PER_MONTH));
  });

  it('is nothing before the phase has started', () => {
    expect(earnedIncomeMinor({ ...span, baseMinor: 300000, changes: [] }, '2025-12-31')).toBe(0);
  });

  it('ignores a change that starts after the phase ends or before it started', () => {
    const earned = earnedIncomeMinor(
      { startDate: '2026-01-01', endDate: '2026-01-31', baseMinor: 300000, changes: [change('2026-03-01', null, 999999), change('2025-01-01', '2025-12-31', 999999)] },
      '2026-12-31'
    );
    expect(earned).toBe(Math.round((300000 * 31) / AVERAGE_DAYS_PER_MONTH));
  });

  it('does not depend on the order the changes are listed in', () => {
    const changes = [change('2026-02-01', '2026-02-28', 0), change('2026-04-01', null, 350000)];
    const input = { ...span, baseMinor: 300000 };
    expect(earnedIncomeMinor({ ...input, changes }, '2026-05-31')).toBe(earnedIncomeMinor({ ...input, changes: [...changes].reverse() }, '2026-05-31'));
  });
});

describe('a living phase with income changes', () => {
  const withChanges = phase({ incomeChanges: [change('2026-04-01', null, 350000, 'PROMOTION')] });

  it('shows the income active on the as-of day in the monthly picture', () => {
    expect(phaseSnapshot(withChanges, '2026-03-15').monthlyIncomeMinor).toBe(300000);
    expect(phaseSnapshot(withChanges, '2026-04-15').monthlyIncomeMinor).toBe(350000);
  });

  it('shows the income at the end of a past phase, and at the start of an upcoming one', () => {
    const past = phase({ endDate: '2026-06-30', incomeChanges: [change('2026-04-01', null, 350000)] });
    expect(phaseSnapshot(past, '2027-01-01').monthlyIncomeMinor).toBe(350000);
    expect(phaseSnapshot(withChanges, '2025-06-01').monthlyIncomeMinor).toBe(300000);
  });

  it('falls back to the base income when no day is given', () => {
    expect(phaseSnapshot(withChanges).monthlyIncomeMinor).toBe(300000);
  });

  it('sums every stretch of income into what the timeline says was earned', () => {
    const [entry] = buildTimeline([withChanges], '2026-04-30');
    expect(entry.monthlyIncomeMinor).toBe(350000);
    expect(entry.totalIncomeMinor).toBe(Math.round((300000 * 90 + 350000 * 30) / AVERAGE_DAYS_PER_MONTH));
  });

  it('works out savings capacity from the active income', () => {
    const costs = [{ id: 'c', category: 'RENT' as const, cadence: 'MONTHLY' as const, amountMinor: 100000 }];
    expect(phaseSnapshot({ ...withChanges, fixedCosts: costs }, '2026-05-01').savingsCapacityMinor).toBe(250000);
  });
});

describe('createLivingPhase income changes', () => {
  const input = phase();

  it('accepts changes, including one at zero', () => {
    expect(createLivingPhase({ ...input, incomeChanges: [change('2026-02-01', '2026-02-28', 0, 'UNEMPLOYMENT')] }).incomeChanges).toHaveLength(1);
  });

  it('rejects a change that ends before it starts or has an invalid amount', () => {
    expect(() => createLivingPhase({ ...input, incomeChanges: [change('2026-02-10', '2026-02-09', 100)] })).toThrow(InvalidLivingPhaseError);
    expect(() => createLivingPhase({ ...input, incomeChanges: [change('2026-02-10', null, -1)] })).toThrow(InvalidLivingPhaseError);
    expect(() => createLivingPhase({ ...input, incomeChanges: [change('2026-02-10', null, 1.5)] })).toThrow(InvalidLivingPhaseError);
  });
});
