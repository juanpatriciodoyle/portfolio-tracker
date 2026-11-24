import { describeSecondSalary } from '../components/describeSecondSalary';
import type { SecondSalaryResponse, TimelineEntryDto } from '../contracts';
import type { Translate } from '../i18n/translate';
import { formatMinor, formatUpTo } from './money';

/** Under this portfolio value (in minor units: 1,000 in the portfolio's currency) "could pay about €1.51 a month" is true but noise. */
export const MIN_PORTFOLIO_FOR_PAYOUT_MINOR = 100_000;

export interface GoalLine {
  key: 'keep' | 'pays';
  label: string;
  text: string;
}

/** What the strip says: its lines, or one quiet prompt when there is no home and income to speak from. */
export type GoalsStripView = { kind: 'prompt' } | { kind: 'goals'; lines: GoalLine[] };

export interface GoalsStripInput {
  /** The home lived in today (null when there is none). */
  phase: TimelineEntryDto | null;
  secondSalary: SecondSalaryResponse | null;
}

/** How much of the monthly cost of living the portfolio could pay, as a whole percent rounded down; null when it is unknown or under 1%. */
function livingCostsCovered(secondSalary: SecondSalaryResponse): number | null {
  const livingCosts = secondSalary.milestones.find(({ kind }) => kind === 'LIVING_COST');
  if (!livingCosts) return null;
  const percent = Math.floor(livingCosts.progress * 100);
  return percent >= 1 ? percent : null;
}

/** What the portfolio could pay, in one or two short sentences: the yield said aloud, then what share of the living costs that is. */
function paysText(secondSalary: SecondSalaryResponse, t: Translate, locale: string): string {
  const pays = t('goals.pays', { yield: formatUpTo(secondSalary.annualYield * 100, 1, locale), amount: formatMinor(secondSalary.secondSalaryMinor, secondSalary.currency, locale) });
  if (secondSalary.gap) return `${pays} ${describeSecondSalary(secondSalary, locale, t).covers}`;
  const covered = livingCostsCovered(secondSalary);
  return covered === null ? pays : `${pays} ${t('goals.pays.covers', { percent: covered })}`;
}

/**
 * The home screen's strip about the person's own life: what they keep each month and what the portfolio could pay
 * (the yield said aloud). Goals live on the profile page. The server did the maths; this only words it.
 * Without a home and an income it is one quiet prompt, never a figure of zero.
 */
export function goalsStrip({ phase, secondSalary }: GoalsStripInput, t: Translate, locale: string): GoalsStripView {
  if (!phase || phase.monthlyIncomeMinor <= 0) return { kind: 'prompt' };
  const lines: GoalLine[] = [];

  const kept = phase.savingsCapacityMinor;
  lines.push({
    key: 'keep',
    label: t('goals.label.keep'),
    text: kept > 0 ? t('goals.keep', { amount: formatMinor(kept, phase.currency, locale) }) : t('goals.shortfall', { amount: formatMinor(-kept, phase.currency, locale) }),
  });

  if (secondSalary && secondSalary.secondSalaryMinor > 0 && secondSalary.capitalMinor >= MIN_PORTFOLIO_FOR_PAYOUT_MINOR) {
    lines.push({ key: 'pays', label: t('goals.label.pays'), text: paysText(secondSalary, t, locale) });
  }

  return { kind: 'goals', lines };
}
