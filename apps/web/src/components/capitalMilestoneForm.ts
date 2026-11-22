import { currentTranslator, type Translate } from '../i18n/translate';
import type { MessageKey } from '../i18n/catalogs';
import { DEFAULT_CAPITAL_REQUIRED_PERCENTAGE, capitalMilestoneSchema, type CapitalMilestone, type CapitalMilestoneCategory, type CapitalMilestonePacingDto } from '../contracts';
import { minorToInputString, parseMajorToMinor } from '../lib/money';

/** What the milestone form holds while it is being filled in. Amount and percentage are as typed. */
export interface MilestoneForm {
  title: string;
  /** The target, in major units. */
  amount: string;
  percentage: string;
  category: CapitalMilestoneCategory;
}

export type MilestoneErrors = Partial<Record<'title' | 'amount' | 'percentage', string>>;
export type MilestoneResult = { ok: true; milestone: CapitalMilestone } | { ok: false; errors: MilestoneErrors };

export const CATEGORY_LABELS: Record<CapitalMilestoneCategory, MessageKey> = {
  PROPERTY: 'capital.category.PROPERTY',
  SABBATICAL: 'capital.category.SABBATICAL',
  VENTURE: 'capital.category.VENTURE',
  CUSTOM: 'capital.category.CUSTOM',
};

/** The name a goal starts with, in the language of the screen. A custom goal starts with no name. */
const presetTitle = (category: CapitalMilestoneCategory, t: Translate): string =>
  category === 'CUSTOM' ? '' : t(`capital.preset.${category}` satisfies MessageKey);

const MAX_TITLE_LENGTH = 60;

export function formForPreset(category: CapitalMilestoneCategory, t: Translate = currentTranslator()): MilestoneForm {
  return { title: presetTitle(category, t), amount: '', percentage: String(DEFAULT_CAPITAL_REQUIRED_PERCENTAGE[category]), category };
}

export function formFromMilestone(milestone: CapitalMilestone, currency: string): MilestoneForm {
  return {
    title: milestone.title,
    amount: minorToInputString(milestone.targetAmountMinor, currency),
    percentage: String(milestone.capitalRequiredPercentage),
    category: milestone.category,
  };
}

/** Picks another kind of goal; the name and requirement follow only while they are still the old preset's. */
export function withCategory(form: MilestoneForm, category: CapitalMilestoneCategory, t: Translate = currentTranslator()): MilestoneForm {
  const untouched = formForPreset(form.category, t);
  const preset = formForPreset(category, t);
  return {
    ...form,
    category,
    title: form.title === untouched.title ? preset.title : form.title,
    percentage: form.percentage === untouched.percentage ? preset.percentage : form.percentage,
  };
}

/** The fields the server stores: a goal as it came back with its pacing is sent back without the pacing. */
export function toCapitalMilestone({ id, title, targetAmountMinor, capitalRequiredPercentage, category, enabled }: CapitalMilestonePacingDto | CapitalMilestone): CapitalMilestone {
  return { id, title, targetAmountMinor, capitalRequiredPercentage, category, enabled };
}

/** A filled form becomes an enabled milestone: saving it is how a goal is switched on. */
export function validateMilestoneForm(form: MilestoneForm, currency: string, id: string, t: Translate = currentTranslator()): MilestoneResult {
  const errors: MilestoneErrors = {};
  const title = form.title.trim();
  const targetAmountMinor = parseMajorToMinor(form.amount, currency);
  const percentage = /^\d+$/.test(form.percentage.trim()) ? Number(form.percentage.trim()) : NaN;

  if (title === '') errors.title = t('capital.errName');
  else if (title.length > MAX_TITLE_LENGTH) errors.title = t('capital.errNameLength', { max: MAX_TITLE_LENGTH });
  if (targetAmountMinor === null || targetAmountMinor <= 0) errors.amount = t('capital.errAmount');
  if (!(percentage >= 1 && percentage <= 100)) errors.percentage = t('capital.errPercentage');
  if (Object.keys(errors).length > 0 || targetAmountMinor === null) return { ok: false, errors };

  const parsed = capitalMilestoneSchema.safeParse({ id, title, targetAmountMinor, capitalRequiredPercentage: percentage, category: form.category, enabled: true });
  return parsed.success ? { ok: true, milestone: parsed.data } : { ok: false, errors: { amount: t('form.amountTooLarge') } };
}
