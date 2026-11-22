import type { LivingPhaseDto } from '../../contracts';
import type { ApiFailure } from '../../lib/apiErrors';
import { formatPhaseRange } from '../../lib/money';
import { currentWords, type Words } from '../../lib/serverMessages';

/** A sentence for a failed change, naming the overlapping phases when that is the problem. */
export function describeFailure(failure: ApiFailure, phases: readonly LivingPhaseDto[] = [], { t, locale }: Words = currentWords()): string {
  switch (failure.kind) {
    case 'overlap': {
      const named = failure.conflictingPhaseIds
        .map((id) => phases.find((phase) => phase.id === id))
        .filter((phase): phase is LivingPhaseDto => phase !== undefined)
        .map((phase) => `${phase.name} (${formatPhaseRange(phase.startDate, phase.endDate)})`);
      return named.length > 0 ? t('failure.overlapNamed', { names: named.join(t('failure.and')) }) : t('failure.overlap');
    }
    case 'validation':
      // The reasons come from the server in English; in another language the generic message stands in for them.
      return failure.issues.length > 0 && locale === 'en' ? failure.issues.map((issue) => issue.message).join(' ') : failure.message;
    case 'not-found':
      return t('failure.notFound');
    default:
      return failure.message;
  }
}

/** Server-side validation problems keyed by the field they belong to. */
export function issuesByField(failure: ApiFailure, { t, locale }: Words = currentWords()): Record<string, string> {
  if (failure.kind !== 'validation') return {};
  const byField: Record<string, string> = {};
  for (const issue of failure.issues) {
    const field = issue.path.split('.')[0];
    if (field && !(field in byField)) byField[field] = locale === 'en' ? issue.message : t('failure.checkField');
  }
  return byField;
}
