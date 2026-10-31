import type { CalendarDate } from '../contracts/vocabulary';

export interface PhaseSpan {
  readonly id: string;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate | null;
}

const covers = (phase: PhaseSpan, day: CalendarDate) => phase.startDate <= day && (phase.endDate === null || day <= phase.endDate);

/**
 * The living phase a bill most likely belongs to: the one that covers the start of the period it bills
 * for, or, when the bill states no period, the one that is current today. `null` when none fits.
 */
export function phaseForBill(phases: readonly PhaseSpan[], periodStart: CalendarDate | null, today: CalendarDate): string | null {
  return phases.find((phase) => covers(phase, periodStart ?? today))?.id ?? null;
}
