import type { CalendarDate } from '../contracts';

interface DatedPhase {
  startDate: CalendarDate;
  /** null means "still living here". */
  endDate: CalendarDate | null;
}

/** The living phase whose days include `day`; null when none does. Phases never overlap, so there is at most one. */
export function phaseCoveringDay<T extends DatedPhase>(phases: readonly T[], day: CalendarDate): T | null {
  return phases.find((phase) => phase.startDate <= day && (phase.endDate === null || day <= phase.endDate)) ?? null;
}

/** Where an expense with no date of its own goes: the home lived in today, or else the one lived in last. */
export function defaultExpensePhase<T extends DatedPhase>(phases: readonly T[], today: CalendarDate): T | null {
  return phaseCoveringDay(phases, today) ?? [...phases].sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}
