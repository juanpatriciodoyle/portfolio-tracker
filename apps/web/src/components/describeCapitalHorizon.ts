import { currentTranslator, type Translate } from '../i18n/translate';
import type { MessageKey } from '../i18n/catalogs';
import type { CapitalHorizonGap, CapitalHorizonResponse, CapitalMilestonePacingDto } from '../contracts';
import { displayLocale, formatMinor } from '../lib/money';

export interface CapitalMilestoneView {
  badge: string;
  subtext: string;
  /** From 0 to 1: how much of the capital needed is held. */
  progress: number;
  progressLabel: string;
}

const GAP_TEXT: Record<CapitalHorizonGap, MessageKey> = {
  NO_CURRENT_PHASE: 'capital.gap.NO_CURRENT_PHASE',
  CURRENCY_MISMATCH: 'capital.gap.CURRENCY_MISMATCH',
};

/** Why a goal has no date: the reason it cannot be paced, in words. */
function whyNoDate({ gap }: CapitalHorizonResponse, t: Translate): string {
  if (gap) return t(GAP_TEXT[gap]);
  return t('capital.noDate');
}

function describeWhen({ title, achieved, monthsRemaining }: CapitalMilestonePacingDto, t: Translate): string {
  if (achieved) return t('capital.achieved', { title });
  if (monthsRemaining === null) return t('capital.start', { title });
  return t('capital.monthsAway', { title, count: monthsRemaining });
}

/** Wording of one goal. The server did the pacing: this only decides how to show it. */
export function describeCapitalMilestone(milestone: CapitalMilestonePacingDto, horizon: CapitalHorizonResponse, locale: string = displayLocale(), t: Translate = currentTranslator()): CapitalMilestoneView {
  const money = (amountMinor: number) => formatMinor(amountMinor, horizon.currency, locale);
  const needed = money(milestone.capitalNeededMinor);
  const held = Math.min(Math.max(horizon.liquidPortfolioMinor, 0), milestone.capitalNeededMinor);

  return {
    badge: describeWhen(milestone, t),
    subtext: t('capital.subtext', { needed, percentage: milestone.capitalRequiredPercentage, why: milestone.monthsRemaining === null ? whyNoDate(horizon, t) : t('capital.paced') }),
    progress: milestone.progress,
    progressLabel: t('capital.progress', { held: money(held), needed }),
  };
}
