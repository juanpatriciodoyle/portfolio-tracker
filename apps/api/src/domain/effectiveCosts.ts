import { MONTHS_PER_CADENCE } from '../contracts/billingPeriod';
import { daysInclusive, AVERAGE_DAYS_PER_MONTH } from '../contracts/calendarDate';
import { vendorKey, vendorNamesMatch } from '../contracts/vendorMatching';
import {
  FIXED_COST_CATEGORIES,
  VARIABLE_COST_CATEGORIES,
  type BillingCadence,
  type CalendarDate,
  type CostBasis,
  type FixedCostCategory,
} from '../contracts/vocabulary';
import { MONTHS_PER_PAYMENT, type FixedCost } from './fixedCosts';
import { roundHalfAwayFromZero } from './money';

/** A rate the person declared for a living phase, with the name they gave it. */
export interface DeclaredCost extends FixedCost {
  readonly label: string | null;
}

/** A bill that actually arrived: what it cost, who sent it and the days it covers. */
export interface BilledCost {
  readonly category: FixedCostCategory;
  readonly cadence: BillingCadence;
  readonly periodStart: CalendarDate;
  readonly periodEnd: CalendarDate;
  readonly amountMinor: number;
  readonly vendor: string;
}

export interface CategoryCost {
  readonly monthlyMinor: number;
  /** null when the category costs nothing and nothing was declared or billed. */
  readonly basis: CostBasis | null;
  /** How many bills the monthly cost was worked out from. */
  readonly billCount: number;
}

export interface EffectiveCosts {
  readonly monthlyFixedCostsMinor: number;
  readonly byCategory: Readonly<Record<FixedCostCategory, CategoryCost>>;
}

const VARIABLE: ReadonlySet<FixedCostCategory> = new Set(VARIABLE_COST_CATEGORIES);

/** How many of the latest months of bills set the monthly cost of a fixed baseline item. */
const TRAILING_MONTHS = 3;
const MONTHS_PER_YEAR = 12;

/** Categories where one declared line per sender is normal, so a bill only replaces the line it is from. */
const PER_SENDER_CATEGORIES: ReadonlySet<FixedCostCategory> = new Set(['SUBSCRIPTIONS', 'OTHER']);

/** The months a bill pays for. A one-off charge counts the months its days cover (a year, for a tax). */
function monthsCovered(bill: BilledCost): number {
  if (bill.cadence !== 'ONE_OFF') return MONTHS_PER_CADENCE[bill.cadence];
  if (bill.category === 'TAXES') return MONTHS_PER_YEAR;
  return Math.max(1, Math.round(daysInclusive(bill.periodStart, bill.periodEnd) / AVERAGE_DAYS_PER_MONTH));
}

/** An amount shared over some months, kept as a whole part plus a fraction so no sum loses a minor unit. */
interface Share {
  readonly whole: number;
  readonly fraction: number;
}

const NO_SHARE: Share = { whole: 0, fraction: 0 };
const FRACTION_GRID = 1e9;

const shareOf = (amount: number, months: number): Share => ({
  whole: (amount - (amount % months)) / months,
  fraction: (amount % months) / months,
});

function addShares(a: Share, b: Share): Share {
  const fraction = Math.round((a.fraction + b.fraction) * FRACTION_GRID) / FRACTION_GRID;
  const carry = Math.floor(fraction);
  return { whole: a.whole + b.whole + carry, fraction: fraction - carry };
}

interface Accumulator {
  share: Share;
  declared: boolean;
  billCount: number;
}

const newestFirst = (a: BilledCost, b: BilledCost) =>
  b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart) || b.amountMinor - a.amountMinor;

/** The average over the latest bills of one sender, enough of them to cover the trailing months. */
function trailingAverage(bills: readonly BilledCost[]): { share: Share; used: number } {
  let amount = 0;
  let months = 0;
  let used = 0;
  for (const bill of [...bills].sort(newestFirst)) {
    if (months >= TRAILING_MONTHS) break;
    amount += bill.amountMinor;
    months += monthsCovered(bill);
    used += 1;
  }
  return { share: shareOf(amount, months), used };
}

/** Whether a declared line is replaced by the bills of its category. */
function isSupersededByBills(cost: DeclaredCost, billsOfCategory: readonly BilledCost[]): boolean {
  if (billsOfCategory.length === 0) return false;
  if (VARIABLE.has(cost.category) || !PER_SENDER_CATEGORIES.has(cost.category)) return true;
  return cost.label === null || billsOfCategory.some((bill) => vendorNamesMatch(cost.label as string, bill.vendor));
}

/**
 * What each category costs per month, from the rates declared and the bills received for one living phase.
 *
 * - Utilities and taxes are variable: once a bill exists, the monthly cost is the average of all the bills,
 *   each weighing the months it covers. A declared rate only stands in until the first bill.
 * - Rent, internet, phone, subscriptions and other are baselines: the declared rate stands until bills
 *   arrive, then the monthly cost follows the average of the latest three months of bills, sender by sender,
 *   so a change of plan moves the cost gradually without splitting the phase.
 *
 * The categories are rounded together so they always add up to the total.
 */
export function effectiveMonthlyCosts(input: {
  readonly declared: readonly DeclaredCost[];
  readonly bills: readonly BilledCost[];
}): EffectiveCosts {
  const accumulators = Object.fromEntries(
    FIXED_COST_CATEGORIES.map((category) => [category, { share: NO_SHARE, declared: false, billCount: 0 } satisfies Accumulator])
  ) as Record<FixedCostCategory, Accumulator>;

  for (const category of FIXED_COST_CATEGORIES) {
    const bills = input.bills.filter((bill) => bill.category === category);
    const total = accumulators[category];

    if (VARIABLE.has(category) && bills.length > 0) {
      const months = bills.reduce((sum, bill) => sum + monthsCovered(bill), 0);
      total.share = shareOf(bills.reduce((sum, bill) => sum + bill.amountMinor, 0), months);
      total.billCount = bills.length;
    } else {
      for (const senderBills of groupBySender(bills)) {
        const { share, used } = trailingAverage(senderBills);
        total.share = addShares(total.share, share);
        total.billCount += used;
      }
    }

    for (const cost of input.declared) {
      if (cost.category !== category || isSupersededByBills(cost, bills)) continue;
      total.share = addShares(total.share, shareOf(cost.amountMinor * (MONTHS_PER_YEAR / MONTHS_PER_PAYMENT[cost.cadence]), MONTHS_PER_YEAR));
      total.declared = true;
    }
  }

  return roundTogether(accumulators);
}

function groupBySender(bills: readonly BilledCost[]): BilledCost[][] {
  const groups = new Map<string, BilledCost[]>();
  for (const bill of bills) groups.set(vendorKey(bill.vendor), [...(groups.get(vendorKey(bill.vendor)) ?? []), bill]);
  return [...groups.values()];
}

/** Rounds once for the whole: the category fractions add up to the extra units, shared by largest remainder. */
function roundTogether(accumulators: Record<FixedCostCategory, Accumulator>): EffectiveCosts {
  const wholeTotal = FIXED_COST_CATEGORIES.reduce((sum, category) => sum + accumulators[category].share.whole, 0);
  const fractionSum = FIXED_COST_CATEGORIES.reduce((sum, category) => sum + accumulators[category].share.fraction, 0);
  const extras = roundHalfAwayFromZero(Math.round(fractionSum * FRACTION_GRID) / FRACTION_GRID);

  const byRemainder = FIXED_COST_CATEGORIES.map((category, order) => ({ category, order, fraction: accumulators[category].share.fraction })).sort(
    (a, b) => b.fraction - a.fraction || a.order - b.order
  );
  const gets = new Set(byRemainder.slice(0, extras).map(({ category }) => category));

  const byCategory = Object.fromEntries(
    FIXED_COST_CATEGORIES.map((category) => {
      const { share, declared, billCount } = accumulators[category];
      const basis: CostBasis | null = billCount > 0 ? (declared ? 'MIXED' : 'BILLS') : declared ? 'DECLARED' : null;
      return [category, { monthlyMinor: share.whole + (gets.has(category) ? 1 : 0), basis, billCount } satisfies CategoryCost];
    })
  ) as Record<FixedCostCategory, CategoryCost>;

  return { monthlyFixedCostsMinor: wholeTotal + extras, byCategory };
}
