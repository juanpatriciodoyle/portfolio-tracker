import type { SecondSalaryResponse, TimelineEntryDto } from '../contracts';
import { useCurrentPhase } from './useCurrentPhase';
import { useSecondSalary } from './useSecondSalary';

export interface HomeGoals {
  /** The home screen has what it needs to speak: the answers are in (or have failed) and the home is known. */
  ready: boolean;
  phase: TimelineEntryDto | null;
  secondSalary: SecondSalaryResponse | null;
}

/**
 * What the goals strip on Home is made of: the home lived in today and what the portfolio could pay.
 * Without the home there is nothing to say, so it is not ready; the portfolio answer may fail and the strip speaks with the other.
 */
export function useHomeGoals(enabled: boolean, version: unknown): HomeGoals {
  const home = useCurrentPhase(enabled, version);
  const salary = useSecondSalary(enabled, version);

  return {
    ready: home.status === 'ready' && salary.status !== 'loading',
    phase: home.phase,
    secondSalary: salary.secondSalary,
  };
}
