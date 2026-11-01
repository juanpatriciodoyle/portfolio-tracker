import { useState } from 'react';
import { CAPITAL_MILESTONE_CATEGORIES, MAX_CAPITAL_MILESTONES, type CapitalHorizonResponse, type CapitalMilestone, type CapitalMilestoneCategory } from '../contracts';
import type { MutationResult } from '../lib/apiErrors';
import CapitalMilestoneEditor from './CapitalMilestoneEditor';
import { CATEGORY_LABELS, formForPreset, formFromMilestone, toCapitalMilestone, type MilestoneForm } from './capitalMilestoneForm';
import { describeCapitalMilestone } from './describeCapitalHorizon';

interface CapitalHorizonCardProps {
  capitalHorizon: CapitalHorizonResponse;
  /** Replaces the whole list of goals. */
  onSave: (milestones: CapitalMilestone[]) => Promise<MutationResult>;
}

/** Presets offered on the empty card; "Venture" is still one click away inside the editor. */
const PRESETS: readonly CapitalMilestoneCategory[] = CAPITAL_MILESTONE_CATEGORIES.filter((category) => category !== 'VENTURE');

type Editing = { kind: 'new'; form: MilestoneForm } | { kind: 'existing'; id: string };

/** How far each goal is from the portfolio, and a quiet way to set or change one. */
export default function CapitalHorizonCard({ capitalHorizon, onSave }: CapitalHorizonCardProps) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const stored = capitalHorizon.milestones.map(toCapitalMilestone);
  const active = capitalHorizon.milestones.filter(({ enabled }) => enabled);
  const hasRoom = stored.length < MAX_CAPITAL_MILESTONES;

  const existing = editing?.kind === 'existing' ? capitalHorizon.milestones.find(({ id }) => id === editing.id) : undefined;
  const save = (milestone: CapitalMilestone) =>
    onSave(stored.some(({ id }) => id === milestone.id) ? stored.map((current) => (current.id === milestone.id ? milestone : current)) : [...stored, milestone]);

  return (
    <section className="capital-horizon" aria-label="Capital horizon">
      {active.map((milestone) => {
        const view = describeCapitalMilestone(milestone, capitalHorizon);
        return (
          <article key={milestone.id} className="capital-horizon__milestone">
            <div className="capital-horizon__top">
              <h3 className="capital-horizon__badge">{view.badge}</h3>
              <button type="button" className="profile-text-button" onClick={() => setEditing({ kind: 'existing', id: milestone.id })}>
                Edit milestone
              </button>
            </div>
            <p className="capital-horizon__subtext">{view.subtext}</p>
            <div
              className="capital-horizon__track"
              role="progressbar"
              aria-label={view.progressLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.floor(view.progress * 100)}
            >
              <div className={`capital-horizon__fill${milestone.achieved ? ' is-achieved' : ''}`} style={{ width: `${view.progress * 100}%` }} />
            </div>
          </article>
        );
      })}

      {hasRoom && (
        <div className={`capital-horizon__ghost${active.length === 0 ? ' is-empty' : ''}`}>
          <button type="button" className="profile-text-button" onClick={() => setEditing({ kind: 'new', form: formForPreset('CUSTOM') })}>
            + Set a milestone target
          </button>
          {active.length === 0 &&
            PRESETS.map((category) => (
              <button key={category} type="button" className="profile-toggle-button" onClick={() => setEditing({ kind: 'new', form: formForPreset(category) })}>
                {CATEGORY_LABELS[category]}
              </button>
            ))}
        </div>
      )}

      {editing?.kind === 'new' && (
        <CapitalMilestoneEditor
          initial={editing.form}
          id={crypto.randomUUID()}
          currency={capitalHorizon.currency}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {existing && (
        <CapitalMilestoneEditor
          initial={formFromMilestone(existing, capitalHorizon.currency)}
          id={existing.id}
          currency={capitalHorizon.currency}
          onSave={save}
          onDelete={() => onSave(stored.filter(({ id }) => id !== existing.id))}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
