import type { CapitalHorizonGap, CapitalHorizonResponse, CapitalMilestonePacingDto } from '../contracts';
import { displayLocale, formatMinor } from '../lib/money';

export interface CapitalMilestoneView {
  badge: string;
  subtext: string;
  /** From 0 to 1: how much of the capital needed is held. */
  progress: number;
  progressLabel: string;
}

const GAP_TEXT: Record<CapitalHorizonGap, string> = {
  NO_CURRENT_PHASE: 'Add the place you live now to estimate the date.',
  CURRENCY_MISMATCH: 'Your costs are in another currency than your portfolio, so the date cannot be estimated yet.',
};

const PACED = 'Paced with your current lifestyle & spending protected.';

/** Why a goal has no date: the reason it cannot be paced, in words. */
function whyNoDate({ gap, monthlySurplusMinor }: CapitalHorizonResponse): string {
  if (gap) return GAP_TEXT[gap];
  return (monthlySurplusMinor ?? 0) < 0 ? 'Spending is above income, so there is no date yet.' : 'Nothing is left over each month, so there is no date yet.';
}

function describeWhen({ title, achieved, monthsRemaining }: CapitalMilestonePacingDto): string {
  if (achieved) return `${title}: Goal achieved!`;
  if (monthsRemaining === null) return `${title}: no date yet`;
  return `${title}: ${monthsRemaining} ${monthsRemaining === 1 ? 'month' : 'months'} away`;
}

/** Wording of one goal. The server did the pacing: this only decides how to show it. */
export function describeCapitalMilestone(milestone: CapitalMilestonePacingDto, horizon: CapitalHorizonResponse, locale: string = displayLocale()): CapitalMilestoneView {
  const money = (amountMinor: number) => formatMinor(amountMinor, horizon.currency, locale);
  const needed = money(milestone.capitalNeededMinor);
  const held = Math.min(Math.max(horizon.liquidPortfolioMinor, 0), milestone.capitalNeededMinor);

  return {
    badge: describeWhen(milestone),
    subtext: `${needed} capital target (${milestone.capitalRequiredPercentage}% requirement) · ${milestone.monthsRemaining === null ? whyNoDate(horizon) : PACED}`,
    progress: milestone.progress,
    progressLabel: `${money(held)} of ${needed} capital target`,
  };
}
