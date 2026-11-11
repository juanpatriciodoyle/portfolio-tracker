import { secondSalaryTargetMonthlyMinorSchema } from '../contracts';
import { parseMajorToMinor } from '../lib/money';

export type TargetResult = { ok: true; monthlyMinor: number } | { ok: false; error: string };

/** What was typed as the monthly second salary to aim at, as the amount the server stores. */
export function validateTargetForm(typed: string, currency: string): TargetResult {
  const minor = parseMajorToMinor(typed, currency);
  if (minor === null || minor <= 0) return { ok: false, error: 'Enter an amount such as 2500.' };
  const parsed = secondSalaryTargetMonthlyMinorSchema.safeParse(minor);
  return parsed.success ? { ok: true, monthlyMinor: parsed.data } : { ok: false, error: 'That amount is too large.' };
}
