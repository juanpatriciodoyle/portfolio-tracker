import type { CreateFixedCostRequest, LivingPhaseDto, PhaseStatus, TimelineEntryDto, UpdateFixedCostRequest, UpdateLivingPhaseRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import type { BillingView } from './billingView';
import LivingPhaseCard from './LivingPhaseCard';

interface PhaseTimelineProps {
  phases: readonly LivingPhaseDto[];
  entries: readonly TimelineEntryDto[];
  expandedId: string | null;
  compareIds: readonly string[];
  onToggleExpanded: (phaseId: string) => void;
  onToggleCompare: (phaseId: string) => void;
  onEdit: (phaseId: string) => void;
  onDelete: (phaseId: string) => Promise<MutationResult<unknown>>;
  onUpdatePhase: (phaseId: string, input: UpdateLivingPhaseRequest) => Promise<MutationResult<unknown>>;
  onAddCost: (phaseId: string, input: CreateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onUpdateCost: (phaseId: string, costId: string, input: UpdateFixedCostRequest) => Promise<MutationResult<unknown>>;
  onDeleteCost: (phaseId: string, costId: string) => Promise<MutationResult<unknown>>;
  billing?: BillingView;
  announce: (message: string) => void;
}

const STATUS_ORDER: Record<PhaseStatus, number> = { current: 0, upcoming: 1, past: 2 };

/** Where you live now first, then what is coming up, then where you have been, most recent first. */
function orderPhases(phases: readonly LivingPhaseDto[], entryById: ReadonlyMap<string, TimelineEntryDto>) {
  const rank = (phase: LivingPhaseDto) => {
    const status = entryById.get(phase.id)?.status;
    return status === undefined ? 3 : STATUS_ORDER[status];
  };
  return [...phases].sort((a, b) => {
    const byStatus = rank(a) - rank(b);
    if (byStatus !== 0) return byStatus;
    return rank(a) === STATUS_ORDER.upcoming ? a.startDate.localeCompare(b.startDate) : b.startDate.localeCompare(a.startDate);
  });
}

export default function PhaseTimeline({
  phases,
  entries,
  expandedId,
  compareIds,
  onToggleExpanded,
  onToggleCompare,
  onEdit,
  onDelete,
  onUpdatePhase,
  onAddCost,
  onUpdateCost,
  onDeleteCost,
  billing,
  announce,
}: PhaseTimelineProps) {
  const entryById = new Map(entries.map((entry) => [entry.phaseId, entry]));

  return (
    <ol className="phase-timeline" aria-label="Living phases">
      {orderPhases(phases, entryById).map((phase) => (
        <li key={phase.id}>
          <LivingPhaseCard
            phase={phase}
            entry={entryById.get(phase.id)}
            expanded={expandedId === phase.id}
            compareSelected={compareIds.includes(phase.id)}
            onToggleExpanded={() => onToggleExpanded(phase.id)}
            onToggleCompare={() => onToggleCompare(phase.id)}
            onEdit={() => onEdit(phase.id)}
            onDelete={() => onDelete(phase.id)}
            onUpdatePhase={onUpdatePhase}
            onAddCost={onAddCost}
            onUpdateCost={onUpdateCost}
            onDeleteCost={onDeleteCost}
            billing={billing}
            announce={announce}
          />
        </li>
      ))}
    </ol>
  );
}
