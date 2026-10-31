import type { CalendarDate, FixedCostCategory } from '../contracts/vocabulary';
import { fold } from './documentExtraction/text';

export interface BillIdentityParts {
  readonly phaseId: string;
  readonly category: FixedCostCategory;
  readonly periodStart: CalendarDate;
  readonly periodEnd: CalendarDate;
  readonly amountMinor: number;
  readonly vendor: string;
}

/**
 * What makes two bills the same bill: same living phase, category, period, amount and sender. The sender is
 * compared without case, accents or extra spaces, so a retyped name is still caught. Fields are joined with a
 * character that cannot appear in any of them, so values cannot run into each other.
 */
export function billIdentity(parts: BillIdentityParts): string {
  const vendor = fold(parts.vendor).replace(/\s+/g, ' ').trim();
  return [parts.phaseId, parts.category, parts.periodStart, parts.periodEnd, String(parts.amountMinor), vendor].join('\u0000');
}
