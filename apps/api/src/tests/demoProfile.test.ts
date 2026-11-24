import { calendarDateOf, daysInclusive, monthOf } from '../contracts';
import { buildTimeline, createFixedCost, createLivingPhase } from '../domain/livingPhase';
import { demoProfile } from '../domain/demoProfile';
import { MAX_CAPITAL_MILESTONES } from '../contracts';

const TODAY = '2026-11-23';

describe('the demo guest’s profile', () => {
  it('is a complete life: a past home and the one lived in today, with income and costs', () => {
    const { phases } = demoProfile(TODAY);

    expect(phases.map(({ phase }) => phase.city)).toEqual(['Valencia', 'Madrid']);
    const [past, current] = phases.map(({ phase }) => phase);
    expect(past.endDate).not.toBeNull();
    expect(current.endDate).toBeNull();
    expect(past.endDate! < current.startDate).toBe(true);
    for (const phase of [past, current]) {
      expect(phase.incomeStreams.length).toBeGreaterThan(0);
      expect(phase.fixedCosts.length).toBeGreaterThan(0);
    }
  });

  it('has bills for the home lived in today, for the months just gone, each inside that home’s dates', () => {
    const { phases } = demoProfile(TODAY);
    const { phase, bills } = phases[1];

    expect(bills.length).toBeGreaterThanOrEqual(4);
    for (const bill of bills) {
      expect(bill.periodStart >= phase.startDate).toBe(true);
      expect(bill.periodEnd < TODAY).toBe(true);
      // parse, don't validate: the builder only hands out what the contract accepts, so a bill never says more days than its cadence allows
      expect(daysInclusive(bill.periodStart, bill.periodEnd)).toBeLessThanOrEqual(35);
    }
  });

  it('keeps its bills on the last full months, whatever day the demo is opened', () => {
    const november = demoProfile('2026-11-23').phases[1].bills.map((bill) => monthOf(bill.periodEnd));
    const january = demoProfile('2027-01-05').phases[1].bills.map((bill) => monthOf(bill.periodEnd));

    expect(Math.max(...november.map((month) => Number(month.replace('-', ''))))).toBe(202610);
    expect(Math.max(...january.map((month) => Number(month.replace('-', ''))))).toBe(202612);
  });

  it('has two goals and a second-salary target, so the milestone cards have something to show', () => {
    const { capitalMilestones, secondSalaryTargetMinor } = demoProfile(TODAY);

    expect(capitalMilestones).toHaveLength(2);
    expect(capitalMilestones.length).toBeLessThanOrEqual(MAX_CAPITAL_MILESTONES);
    expect(new Set(capitalMilestones.map(({ id }) => id)).size).toBe(2);
    expect(capitalMilestones.every(({ enabled }) => enabled)).toBe(true);
    expect(secondSalaryTargetMinor).toBeGreaterThan(0);
  });

  it('is a made-up person: nothing in it belongs to a real one', () => {
    const { profile } = demoProfile(TODAY);

    expect(profile.fullName).toBe('Joe Demo');
    expect(profile.birthYear).toBeLessThan(Number(calendarDateOf(new Date('2026-11-23')).slice(0, 4)));
  });
});

describe('the demo guest’s profile tells a story the cards can show', () => {
  const asOf = TODAY;
  const timelineOf = () => {
    const { phases } = demoProfile(asOf);
    const entries = buildTimeline(
      phases.map(({ phase, bills }, index) =>
        createLivingPhase({
          id: `demo-${index}`,
          startDate: phase.startDate,
          endDate: phase.endDate ?? null,
          currency: phase.currency,
          incomeStreams: phase.incomeStreams.map((stream) => ({ ...stream, endDate: stream.endDate ?? null })),
          fixedCosts: phase.fixedCosts.map((cost, position) => createFixedCost({ id: `c${index}-${position}`, ...cost })),
          bills: bills.map(({ category, cadence, periodStart, periodEnd, amountMinor, vendor }) => ({ category, cadence, periodStart, periodEnd, amountMinor, vendor })),
        })
      ),
      asOf
    );
    return { past: entries[0], current: entries[1] };
  };

  it('has no job in the finished home that is still open-ended, and says why each one ended', () => {
    const [past] = demoProfile(asOf).phases.map(({ phase }) => phase);
    for (const stream of past.incomeStreams) {
      expect(stream.endDate).not.toBeNull();
      expect(stream.endDate! <= past.endDate!).toBe(true);
      expect(stream.endReason).toBeDefined();
    }
  });

  it('gives the home lived in today a raise, so the average month differs from the current rate', () => {
    const { current } = timelineOf();
    expect(current.monthlyIncomeMinor).toBeGreaterThan(current.averageMonthlyIncomeMinor + 10_000);
  });

  it('gives the finished home an average month that differs from the pay on its last day', () => {
    const { past } = timelineOf();
    expect(past.monthlyIncomeMinor).not.toBe(past.averageMonthlyIncomeMinor);
  });

  it('has an internet bill that moved on from the declared rate, so declared and from-bills differ', () => {
    const { current } = timelineOf();
    expect(current.costBasisByCategory.INTERNET.basis).toBe('BILLS');
    expect(current.fixedCostsByCategoryMinor.INTERNET).not.toBe(current.declaredCostsByCategoryMinor.INTERNET);
  });
});
