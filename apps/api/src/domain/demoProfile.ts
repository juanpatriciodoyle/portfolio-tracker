import {
  capitalMilestoneSchema,
  createBillingRecordRequest,
  createLivingPhaseRequest,
  firstDayOf,
  lastDayOf,
  monthOf,
  monthsEndingAt,
  previousMonth,
  profileDataSchema,
  type CalendarDate,
  type CapitalMilestone,
  type CreateBillingRecordRequest,
  type CreateLivingPhaseRequest,
  type ProfileData,
} from '../contracts';

/** A home of the demo guest, and the bills received there. The bills' phase id is filled in when the home is saved. */
export interface DemoPhase {
  readonly phase: CreateLivingPhaseRequest;
  readonly bills: ReadonlyArray<Omit<CreateBillingRecordRequest, 'phaseId'>>;
}

export interface DemoProfile {
  readonly profile: ProfileData;
  readonly phases: readonly DemoPhase[];
  readonly capitalMilestones: readonly CapitalMilestone[];
  readonly secondSalaryTargetMinor: number;
}

/** How many of the latest full months the demo has electricity, gas and internet bills for. */
const BILLED_MONTHS = 4;

/** Euros and cents to the minor unit the app stores. */
const euros = (amount: number): number => Math.round(amount * 100);

/**
 * The profile every demo guest starts with: a made-up designer who moved from Valencia to Madrid, with income, rent and
 * bills, two goals and a second-salary target. Pure: the day it is built for is given, so the bills always sit on the
 * months just gone. Everything is parsed against the contracts, so a mistake here fails at once and never reaches a guest.
 */
export function demoProfile(today: CalendarDate): DemoProfile {
  const lastBilledMonth = previousMonth(monthOf(today));
  const billedMonths = monthsEndingAt(lastBilledMonth, BILLED_MONTHS);

  const valencia = createLivingPhaseRequest.parse({
    name: 'Valencia',
    city: 'Valencia',
    countryCode: 'ES',
    tenure: 'RENT',
    startDate: '2021-02-01',
    endDate: '2023-02-28',
    currency: 'EUR',
    incomeStreams: [
      { label: 'Junior designer', amountMinor: euros(2400), startDate: '2021-02-01', endDate: '2022-06-30', endReason: 'OTHER' },
      { label: 'Designer', amountMinor: euros(2900), startDate: '2022-07-01', endDate: '2023-02-28', endReason: 'QUIT' },
    ],
    fixedCosts: [
      { category: 'RENT', cadence: 'MONTHLY', amountMinor: euros(760), label: 'Rent' },
      { category: 'INTERNET', cadence: 'MONTHLY', amountMinor: euros(39), label: 'Fibre' },
    ],
  });

  const madrid = createLivingPhaseRequest.parse({
    name: 'Madrid',
    city: 'Madrid',
    countryCode: 'ES',
    tenure: 'RENT',
    startDate: '2023-03-01',
    endDate: null,
    currency: 'EUR',
    incomeStreams: [
      { label: 'Product designer', amountMinor: euros(3000), startDate: '2023-03-01', endDate: '2024-08-31', endReason: 'OTHER' },
      { label: 'Senior product designer', amountMinor: euros(3400), startDate: '2024-09-01', endDate: null },
    ],
    fixedCosts: [
      { category: 'RENT', cadence: 'MONTHLY', amountMinor: euros(985), label: 'Rent' },
      { category: 'INTERNET', cadence: 'MONTHLY', amountMinor: euros(45), label: 'Fibre' },
      { category: 'PHONE', cadence: 'MONTHLY', amountMinor: euros(20), label: 'Mobile' },
      { category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', amountMinor: euros(28), label: 'Streaming and music' },
    ],
  });

  const electricity = [68.45, 61.2, 58.9, 64.3];
  const gas = [28.4, 31.2, 36.8, 42.5];
  // The fibre plan went up halfway through: the bills now say more than the rate declared when moving in.
  const internet = [45, 45, 52, 52];
  const bills = billedMonths.flatMap((month, index) => [
    monthlyBill(month, 'ELECTRICITY', 'Iberdrola', euros(electricity[index])),
    monthlyBill(month, 'GAS', 'Naturgy', euros(gas[index])),
    monthlyBill(month, 'INTERNET', 'Movistar', euros(internet[index])),
  ]);

  return {
    profile: profileDataSchema.parse({
      fullName: 'Joe Demo',
      birthYear: 1991,
      nationalities: ['ES'],
      taxResidence: 'ES',
      householdAdults: 1,
      dependentChildren: 0,
      employmentStatus: 'EMPLOYEE',
    }),
    phases: [
      { phase: valencia, bills: [] },
      { phase: madrid, bills },
    ],
    capitalMilestones: [
      capitalMilestoneSchema.parse({ id: 'demo-flat', title: 'Flat deposit', targetAmountMinor: euros(280000), capitalRequiredPercentage: 30, category: 'PROPERTY', enabled: true }),
      capitalMilestoneSchema.parse({ id: 'demo-sabbatical', title: 'Sabbatical year', targetAmountMinor: euros(30000), capitalRequiredPercentage: 100, category: 'SABBATICAL', enabled: true }),
    ],
    secondSalaryTargetMinor: euros(2500),
  };
}

function monthlyBill(month: string, category: 'ELECTRICITY' | 'GAS' | 'INTERNET', vendor: string, amountMinor: number): Omit<CreateBillingRecordRequest, 'phaseId'> {
  const { phaseId: _phaseId, ...bill } = createBillingRecordRequest.parse({
    phaseId: 'pending',
    category,
    cadence: 'MONTHLY',
    periodStart: firstDayOf(month),
    periodEnd: lastDayOf(month),
    amountMinor,
    vendor,
  });
  return bill;
}
