import type { MilestoneDto, SecondSalaryGap, SecondSalaryResponse } from '../contracts';
import { displayLocale, formatMinor } from '../lib/money';

type MilestoneKind = MilestoneDto['kind'];

export interface BarTick {
  id: MilestoneDto['id'];
  label: string;
  /** From 0 to 1 along the bar. */
  position: number;
  reached: boolean;
}

export interface SecondSalaryView {
  badge: string;
  subtext: string;
  bar: {
    /** From 0 to 1: how much of the bar the second salary fills. */
    fill: number;
    ticks: BarTick[];
    /** Where the 3,000 to 5,000 range starts, from 0 to 1. */
    targetStart: number;
    targetLabel: string;
    targetNote: string;
    summary: string;
  };
}

const SHORT_NAME: Record<MilestoneKind, string> = {
  UTILITIES_AND_SUBSCRIPTIONS: 'Utilities & subscriptions',
  RENT: 'Rent',
  LIVING_COST: 'Living costs',
};

/** The words that finish "of the way to covering ...". */
const COVERING: Record<MilestoneKind, string> = {
  UTILITIES_AND_SUBSCRIPTIONS: 'your utilities & subscriptions',
  RENT: 'your rent',
  LIVING_COST: 'your living costs',
};

const REACHED_TEXT: Record<MilestoneDto['id'], string> = {
  1: 'Covers 100% of your utilities & subscriptions.',
  2: 'Covers 100% of your rent.',
  3: '100% Living Cost Autonomy (Your capital covers your monthly living costs).',
};

const GAP_TEXT: Record<SecondSalaryGap, string> = {
  NO_CURRENT_PHASE: 'Add the place you live now to see what your second salary covers.',
  NO_COSTS: 'Add your monthly costs to see what your second salary covers.',
  CURRENCY_MISMATCH: 'Your costs are in another currency than your portfolio, so they cannot be compared yet.',
};

/** The nearest milestone still ahead: the cheapest one not reached. */
function nextMilestone(milestones: readonly MilestoneDto[]): MilestoneDto | undefined {
  return milestones.filter(({ reached }) => !reached).sort((a, b) => a.monthlyCostMinor - b.monthlyCostMinor)[0];
}

function describeSubtext(result: SecondSalaryResponse): string {
  if (result.gap) return GAP_TEXT[result.gap];
  if (result.reachedMilestone) return REACHED_TEXT[result.reachedMilestone];
  const next = nextMilestone(result.milestones);
  if (!next) return '';
  const percent = Math.floor(next.progress * 100);
  return percent === 0 ? `Every euro invested moves you toward covering ${COVERING[next.kind]}.` : `${percent}% of the way to covering ${COVERING[next.kind]}.`;
}

/** Wording and geometry of the second-salary card. The server did the maths: this only decides how to show it. */
export function describeSecondSalary(result: SecondSalaryResponse, locale: string = displayLocale()): SecondSalaryView {
  const money = (amountMinor: number) => formatMinor(amountMinor, result.currency, locale);
  const { target } = result;
  const range = `${money(target.minMonthlyMinor)}–${money(target.maxMonthlyMinor)}`;

  return {
    badge: result.secondSalaryMinor > 0 ? `Second Salary: ${money(result.secondSalaryMinor)} / month` : 'Second Salary: your first investment starts it',
    subtext: describeSubtext(result),
    bar: {
      fill: target.progress,
      ticks: result.milestones.map(({ id, kind, position, reached }) => ({ id, label: SHORT_NAME[kind], position, reached })),
      targetStart: target.minMarker,
      targetLabel: `${range} / month`,
      targetNote: `Needs ${money(target.minCapitalNeededMinor)}–${money(target.maxCapitalNeededMinor)} invested`,
      summary: `${money(result.secondSalaryMinor)} of the ${range} a month target`,
    },
  };
}
