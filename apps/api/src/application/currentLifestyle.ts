import type { CalendarDate } from '../contracts';
import { phaseSnapshot, phaseStatus } from '../domain/livingPhase';
import type { LoadedPhase } from './livingPhaseService';

export type CurrentLifestyle =
  | { readonly gap: null; readonly snapshot: ReturnType<typeof phaseSnapshot> }
  | { readonly gap: 'NO_CURRENT_PHASE' | 'CURRENCY_MISMATCH'; readonly snapshot: null };

/**
 * The monthly picture of the living phase being lived on `asOf`, if it can be set against money held in
 * `currency`. Amounts in two currencies are never compared, so the other case says why there is no picture.
 */
export function currentLifestyle(phases: readonly LoadedPhase[], asOf: CalendarDate, currency: string): CurrentLifestyle {
  const current = phases.find(({ phase }) => phaseStatus(phase, asOf) === 'current');
  if (!current) return { gap: 'NO_CURRENT_PHASE', snapshot: null };
  const snapshot = phaseSnapshot(current.phase, asOf);
  return snapshot.currency === currency ? { gap: null, snapshot } : { gap: 'CURRENCY_MISMATCH', snapshot: null };
}
