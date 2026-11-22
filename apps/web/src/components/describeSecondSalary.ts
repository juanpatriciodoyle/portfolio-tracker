import { currentTranslator, type Translate } from '../i18n/translate';
import type { MessageKey } from '../i18n/catalogs';
import type { MilestoneDto, SecondSalaryGap, SecondSalaryResponse } from '../contracts';
import { displayLocale, formatMinor } from '../lib/money';

type MilestoneKind = MilestoneDto['kind'];

export interface SecondSalaryView {
  explanation: string;
  /** What the portfolio pays each month, e.g. "€1,000 / month". */
  income: string;
  /** Which of the person's living costs that already covers, or why it cannot be said. */
  covers: string;
  /** The bar toward the target the person chose; null until they choose one. */
  target: {
    label: string;
    /** From 0 to 1. */
    fill: number;
    summary: string;
    reached: boolean;
    note: string;
  } | null;
}

/** The words that finish "of the way to covering ...". */
const COVERING: Record<MilestoneKind, MessageKey> = {
  UTILITIES_AND_SUBSCRIPTIONS: 'secondSalary.covering.UTILITIES_AND_SUBSCRIPTIONS',
  RENT: 'secondSalary.covering.RENT',
  LIVING_COST: 'secondSalary.covering.LIVING_COST',
};

const REACHED_TEXT: Record<MilestoneDto['id'], MessageKey> = {
  1: 'secondSalary.reached.1',
  2: 'secondSalary.reached.2',
  3: 'secondSalary.reached.3',
};

const GAP_TEXT: Record<SecondSalaryGap, MessageKey> = {
  NO_CURRENT_PHASE: 'secondSalary.gap.NO_CURRENT_PHASE',
  NO_COSTS: 'secondSalary.gap.NO_COSTS',
  CURRENCY_MISMATCH: 'secondSalary.gap.CURRENCY_MISMATCH',
};

/** The nearest milestone still ahead: the cheapest one not reached. */
function nextMilestone(milestones: readonly MilestoneDto[]): MilestoneDto | undefined {
  return milestones.filter(({ reached }) => !reached).sort((a, b) => a.monthlyCostMinor - b.monthlyCostMinor)[0];
}

function describeCovers(result: SecondSalaryResponse, t: Translate): string {
  if (result.gap) return t(GAP_TEXT[result.gap]);
  if (result.reachedMilestone) return t(REACHED_TEXT[result.reachedMilestone]);
  const next = nextMilestone(result.milestones);
  if (!next) return '';
  const percent = Math.floor(next.progress * 100);
  const what = t(COVERING[next.kind]);
  return percent === 0 ? t('secondSalary.everyEuro', { what }) : t('secondSalary.wayThere', { percent, what });
}

/** Wording of the second-salary card. The server did the maths: this only decides how to show it. */
export function describeSecondSalary(result: SecondSalaryResponse, locale: string = displayLocale(), t: Translate = currentTranslator()): SecondSalaryView {
  const money = (amountMinor: number) => formatMinor(amountMinor, result.currency, locale);
  const income = t('secondSalary.perMonth', { amount: money(result.secondSalaryMinor) });
  const { target } = result;

  return {
    explanation: t('secondSalary.explanation'),
    income,
    covers: describeCovers(result, t),
    target: target && {
      label: t('secondSalary.perMonth', { amount: money(target.monthlyMinor) }),
      fill: target.progress,
      summary: t('secondSalary.summary', { income, target: money(target.monthlyMinor) }),
      reached: target.reached,
      note: target.reached ? t('secondSalary.reached') : t('secondSalary.needs', { amount: money(target.capitalNeededMinor) }),
    },
  };
}
