import type { LivingPhaseDto } from '../../contracts';
import type { ApiFailure } from '../../lib/apiErrors';
import { formatPhaseRange } from '../../lib/money';

/** A sentence for a failed change, naming the overlapping phases when that is the problem. */
export function describeFailure(failure: ApiFailure, phases: readonly LivingPhaseDto[] = []): string {
  switch (failure.kind) {
    case 'overlap': {
      const named = failure.conflictingPhaseIds
        .map((id) => phases.find((phase) => phase.id === id))
        .filter((phase): phase is LivingPhaseDto => phase !== undefined)
        .map((phase) => `${phase.name} (${formatPhaseRange(phase.startDate, phase.endDate)})`);
      return named.length > 0
        ? `These dates overlap ${named.join(' and ')}. Adjust the dates so the phases do not overlap.`
        : 'These dates overlap another living phase. Adjust the dates so the phases do not overlap.';
    }
    case 'validation':
      return failure.issues.length > 0 ? failure.issues.map((issue) => issue.message).join(' ') : failure.message;
    case 'not-found':
      return 'That item no longer exists. It may have been removed elsewhere.';
    default:
      return failure.message;
  }
}

/** Server-side validation problems keyed by the field they belong to. */
export function issuesByField(failure: ApiFailure): Record<string, string> {
  if (failure.kind !== 'validation') return {};
  const byField: Record<string, string> = {};
  for (const issue of failure.issues) {
    const field = issue.path.split('.')[0];
    if (field && !(field in byField)) byField[field] = issue.message;
  }
  return byField;
}
