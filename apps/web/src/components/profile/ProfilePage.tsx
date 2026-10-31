import { ArrowLeft, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { LivingPhaseDto, TimelineEntryDto } from '../../contracts';
import { useLivingPhases } from '../../hooks/useLivingPhases';
import { usePhaseComparison } from '../../hooks/usePhaseComparison';
import { useProfile } from '../../hooks/useProfile';
import { combineStatuses, type MutationResult } from '../../lib/apiErrors';
import PhaseComparison from './PhaseComparison';
import PhaseEditorDrawer from './PhaseEditorDrawer';
import type { PhasePayload } from './phaseForm';
import PhaseTimeline from './PhaseTimeline';
import ProfileForm from './ProfileForm';
import './profile.css';

interface ProfilePageProps {
  /** Back to the dashboard. */
  onBack: () => void;
  /** The session has ended: return to sign-in. */
  onSignedOut: () => void;
}

type EditorState = { mode: 'create' } | { mode: 'edit'; phaseId: string } | null;

/** The currency of the most recent home, as a sensible default for the next one. */
function latestCurrency(phases: readonly LivingPhaseDto[]): string {
  return [...phases].sort((a, b) => b.startDate.localeCompare(a.startDate))[0]?.currency ?? 'EUR';
}

export default function ProfilePage({ onBack, onSignedOut }: ProfilePageProps) {
  const phasesApi = useLivingPhases();
  const profileApi = useProfile();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorState>(null);
  const [announcement, setAnnouncement] = useState('');

  const { phases, entries } = phasesApi;
  const status = combineStatuses(phasesApi.status, profileApi.status);
  const announce = useCallback((message: string) => setAnnouncement(message), []);

  const picked = compareIds
    .map((id) => entries.find((entry) => entry.phaseId === id))
    .filter((entry): entry is TimelineEntryDto => entry !== undefined);
  const [from, to] = picked.length === 2 ? [...picked].sort((a, b) => a.startDate.localeCompare(b.startDate)) : [undefined, undefined];
  const comparison = usePhaseComparison(phasesApi.compare, from?.phaseId ?? null, to?.phaseId ?? null, entries);

  const editingPhase = editor?.mode === 'edit' ? (phases.find((phase) => phase.id === editor.phaseId) ?? null) : null;
  const drawerOpen = editor !== null && (editor.mode === 'create' || editingPhase !== null);

  const retry = () => {
    phasesApi.reload();
    profileApi.reload();
  };

  const toggleCompare = (phaseId: string) =>
    setCompareIds((previous) => (previous.includes(phaseId) ? previous.filter((id) => id !== phaseId) : [...previous.slice(-1), phaseId]));

  const submitPhase = async (payload: PhasePayload): Promise<MutationResult<unknown>> => {
    if (editor?.mode === 'edit') {
      const result = await phasesApi.updatePhase(editor.phaseId, payload.update);
      if (result.ok) {
        setEditor(null);
        announce('Living phase updated');
      }
      return result;
    }
    const result = await phasesApi.createPhase(payload.create);
    if (result.ok) {
      setEditor(null);
      setExpandedId(result.value.id);
      announce('Living phase added');
    }
    return result;
  };

  const removePhase = async (phaseId: string) => {
    const result = await phasesApi.deletePhase(phaseId);
    if (result.ok) {
      setExpandedId((current) => (current === phaseId ? null : current));
      announce('Living phase deleted');
    }
    return result;
  };

  return (
    <div className="profile-page">
      <header className="profile-page__header">
        <button type="button" className="profile-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Dashboard
        </button>
        <h1 className="profile-page__title">Profile</h1>
      </header>

      <main className="profile-page__main">
        <div className="profile-page__content">
          {status === 'signed-out' && (
            <div className="profile-banner profile-banner--warning" role="alert">
              <p>Your session has ended. Sign in again to see your profile.</p>
              <button type="button" className="btn-primary-apply profile-banner__action" onClick={onSignedOut}>
                Sign in again
              </button>
            </div>
          )}
          {status === 'encryption-unavailable' && (
            <div className="profile-banner profile-banner--warning" role="alert">
              <p>
                <strong>Profile data cannot be stored yet.</strong> The server has no encryption key. Add{' '}
                <code>PROFILE_ENCRYPTION_KEY</code> to <code>apps/api/.env</code> and restart the API.
              </p>
              <button type="button" className="btn-secondary-cancel profile-banner__action" onClick={retry}>
                Try again
              </button>
            </div>
          )}
          {status === 'error' && (
            <div className="profile-banner profile-banner--error" role="alert">
              <p>{phasesApi.message ?? profileApi.message ?? 'Something went wrong.'}</p>
              <button type="button" className="btn-secondary-cancel profile-banner__action" onClick={retry}>
                Try again
              </button>
            </div>
          )}
          {status === 'loading' && (
            <p className="profile-page__loading" role="status">
              Loading…
            </p>
          )}

          {profileApi.status === 'ready' && profileApi.profile && (
            <ProfileForm profile={profileApi.profile} onSave={profileApi.save} announce={announce} />
          )}

          {phasesApi.status === 'ready' && (
            <section aria-labelledby="living-phases-heading" className="profile-phases">
              <div className="profile-section__header">
                <div>
                  <h2 className="profile-section__title" id="living-phases-heading">
                    Living phases
                  </h2>
                  {phases.length > 1 && <p className="profile-section__hint">Pick two phases to compare them.</p>}
                </div>
                <button type="button" className="profile-add-button" onClick={() => setEditor({ mode: 'create' })}>
                  <Plus size={16} aria-hidden="true" /> Add living phase
                </button>
              </div>

              {from && to && (
                <PhaseComparison fromName={from.name} toName={to.name} state={comparison} onClose={() => setCompareIds([])} />
              )}

              {phases.length === 0 ? (
                <div className="profile-card profile-empty">
                  <h3 className="profile-empty__title">Where have you lived?</h3>
                  <p className="profile-section__hint">
                    Add your current home first, then the places you lived before. Each one keeps its own costs, so you can see
                    how your life changed.
                  </p>
                  <button type="button" className="btn-primary-apply profile-empty__action" onClick={() => setEditor({ mode: 'create' })}>
                    Add your first living phase
                  </button>
                </div>
              ) : (
                <PhaseTimeline
                  phases={phases}
                  entries={entries}
                  expandedId={expandedId}
                  compareIds={compareIds}
                  onToggleExpanded={(phaseId) => setExpandedId((current) => (current === phaseId ? null : phaseId))}
                  onToggleCompare={toggleCompare}
                  onEdit={(phaseId) => setEditor({ mode: 'edit', phaseId })}
                  onDelete={removePhase}
                  onAddCost={phasesApi.addFixedCost}
                  onUpdateCost={phasesApi.updateFixedCost}
                  onDeleteCost={phasesApi.deleteFixedCost}
                  announce={announce}
                />
              )}
            </section>
          )}
        </div>
      </main>

      <PhaseEditorDrawer
        isOpen={drawerOpen}
        phase={editingPhase}
        phases={phases}
        hasCurrentPhase={entries.some((entry) => entry.status === 'current')}
        defaultCurrency={latestCurrency(phases)}
        onClose={() => setEditor(null)}
        onSubmit={submitPhase}
      />

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
