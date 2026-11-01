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

export const CATEGORY_LABELS: Record<CapitalMilestoneCategory, string> = {
  PROPERTY: 'Property',
  SABBATICAL: 'Sabbatical',
  VENTURE: 'Venture',
  CUSTOM: 'Custom',
};

const PRESET_TITLES: Record<CapitalMilestoneCategory, string> = {
  PROPERTY: 'Property Down Payment',
  SABBATICAL: 'Sabbatical Fund',
  VENTURE: 'Venture Launchpad',
  CUSTOM: '',
};

const MAX_TITLE_LENGTH = 60;

export function formForPreset(category: CapitalMilestoneCategory): MilestoneForm {
  return { title: PRESET_TITLES[category], amount: '', percentage: String(DEFAULT_CAPITAL_REQUIRED_PERCENTAGE[category]), category };
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
export function withCategory(form: MilestoneForm, category: CapitalMilestoneCategory): MilestoneForm {
  const untouched = formForPreset(form.category);
  const preset = formForPreset(category);
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
export function validateMilestoneForm(form: MilestoneForm, currency: string, id: string): MilestoneResult {
  const errors: MilestoneErrors = {};
  const title = form.title.trim();
  const targetAmountMinor = parseMajorToMinor(form.amount, currency);
  const percentage = /^\d+$/.test(form.percentage.trim()) ? Number(form.percentage.trim()) : NaN;

  if (title === '') errors.title = 'Give it a name.';
  else if (title.length > MAX_TITLE_LENGTH) errors.title = `Keep the name under ${MAX_TITLE_LENGTH} characters.`;
  if (targetAmountMinor === null || targetAmountMinor <= 0) errors.amount = 'Enter an amount such as 350000.';
  if (!(percentage >= 1 && percentage <= 100)) errors.percentage = 'Use a whole number from 1 to 100.';
  if (Object.keys(errors).length > 0 || targetAmountMinor === null) return { ok: false, errors };

  const parsed = capitalMilestoneSchema.safeParse({ id, title, targetAmountMinor, capitalRequiredPercentage: percentage, category: form.category, enabled: true });
  return parsed.success ? { ok: true, milestone: parsed.data } : { ok: false, errors: { amount: 'That amount is too large.' } };
}
