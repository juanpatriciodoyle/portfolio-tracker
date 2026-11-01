import { ArrowLeft, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { LivingPhaseDto, TimelineEntryDto } from '../../contracts';
import { useBillingRecords } from '../../hooks/useBillingRecords';
import { useLivingPhases } from '../../hooks/useLivingPhases';
import { usePhaseComparison } from '../../hooks/usePhaseComparison';
import { useProfile } from '../../hooks/useProfile';
import { useBenchmarks } from '../../hooks/useBenchmarks';
import { useTrends } from '../../hooks/useTrends';
import { combineStatuses, type MutationResult } from '../../lib/apiErrors';
import { vendorHistory } from './vendorHistory';
import type { BillingView } from './billingView';
import { MAX_COMPARED_PHASES, MIN_COMPARED_PHASES } from './comparisonTable';
import PhaseComparison from './PhaseComparison';
import PhaseComparisonTable from './PhaseComparisonTable';
import OnboardingWizard from './OnboardingWizard';
import PhaseWizard from './PhaseWizard';
import type { PhasePayload } from './phaseForm';
import { isProfileEmpty } from './profileDraft';
import PhaseTimeline from './PhaseTimeline';
import ProfileForm from './ProfileForm';
import TrendsCard from './TrendsCard';
import './profile.css';

interface ProfilePageProps {
  /** Back to the dashboard. */
  onBack: () => void;
  /** The session has ended: return to sign-in. */
  onSignedOut: () => void;
}

type EditorState = { mode: 'create' } | { mode: 'edit'; phaseId: string } | { mode: 'onboarding' } | null;

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
  // Bills and trends depend on the phases: they load once those are ready and again whenever they change.
  const dataReady = phasesApi.status === 'ready';
  const trendsApi = useTrends(dataReady, entries);
  const benchmarksApi = useBenchmarks(dataReady, entries);
  // A bill moves the monthly costs of its phase, so the timeline reloads along with the trends.
  const reloadPhases = phasesApi.reload;
  const reloadTrends = trendsApi.reload;
  const afterBillChange = useCallback(() => {
    reloadTrends();
    reloadPhases();
  }, [reloadTrends, reloadPhases]);
  const billsApi = useBillingRecords(dataReady, entries, afterBillChange);
  const history = useMemo(() => vendorHistory(phases, billsApi.records), [phases, billsApi.records]);
  const billing: BillingView = {
    asOf: phasesApi.asOf,
    phases,
    recordsFor: (phaseId) => billsApi.records.filter((record) => record.phaseId === phaseId),
    history,
    onAdd: billsApi.createBill,
    onUpdate: billsApi.updateBill,
    onDelete: billsApi.deleteBill,
    benchmarks: {
      status: benchmarksApi.status,
      message: benchmarksApi.message,
      benchmarks: benchmarksApi.benchmarks,
      onRetry: benchmarksApi.reload,
      nameOf: (phaseId) => phases.find((phase) => phase.id === phaseId)?.name,
    },
  };
  // Where a person is most likely to log a bill: the home they live in now, else the latest one.
  const billPhase = phases.find((phase) => entries.find((entry) => entry.phaseId === phase.id)?.status === 'current') ?? phases.at(-1);
  const status = combineStatuses(phasesApi.status, profileApi.status);
  const announce = useCallback((message: string) => setAnnouncement(message), []);

  const picked = compareIds
    .map((id) => entries.find((entry) => entry.phaseId === id))
    .filter((entry): entry is TimelineEntryDto => entry !== undefined);
  // Two homes in different currencies need the server's exchange rates; every other choice reads straight from the timeline.
  const needsConversion = picked.length === 2 && picked[0].currency !== picked[1].currency;
  const [from, to] = needsConversion ? [...picked].sort((a, b) => a.startDate.localeCompare(b.startDate)) : [undefined, undefined];
  const comparison = usePhaseComparison(phasesApi.compare, from?.phaseId ?? null, to?.phaseId ?? null, entries);

  const editingPhase = editor?.mode === 'edit' ? (phases.find((phase) => phase.id === editor.phaseId) ?? null) : null;
  const phaseWizardOpen = editor?.mode === 'create' || (editor?.mode === 'edit' && editingPhase !== null);
  // Today comes from the server's clock, the same one that decides which phase is current.
  const today = phasesApi.asOf ?? '';
  const hasCurrentPhase = entries.some((entry) => entry.status === 'current');
  const profileEmpty = profileApi.status === 'ready' && profileApi.profile !== null && isProfileEmpty(profileApi.profile);

  const retry = () => {
    phasesApi.reload();
    profileApi.reload();
  };

  const toggleCompare = (phaseId: string) =>
    setCompareIds((previous) => (previous.includes(phaseId) ? previous.filter((id) => id !== phaseId) : [...previous.slice(-(MAX_COMPARED_PHASES - 1)), phaseId]));

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

  /** The first-time flow adds the first home itself, so it only has to open it afterwards. */
  const createFirstPhase = async (payload: PhasePayload): Promise<MutationResult<unknown>> => {
    const result = await phasesApi.createPhase(payload.create);
    if (result.ok) setExpandedId(result.value.id);
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

          {profileApi.status === 'ready' && profileApi.profile && profileEmpty && (
            <section className="profile-card profile-empty" aria-label="About you">
              <h2 className="profile-empty__title">About you</h2>
              <p className="profile-section__hint">
                Tell us a little about yourself. Age, household and work let us compare your numbers with people like you.
              </p>
              <button type="button" className="btn-primary-apply profile-empty__action" onClick={() => setEditor({ mode: 'onboarding' })}>
                Tell us about yourself
              </button>
            </section>
          )}
          {profileApi.status === 'ready' && profileApi.profile && !profileEmpty && (
            <ProfileForm profile={profileApi.profile} onSave={profileApi.save} announce={announce} />
          )}

          {/* Until the profile is filled in, the one button above leads the way into the first home too. */}
          {phasesApi.status === 'ready' && !(profileEmpty && phases.length === 0) && (
            <section aria-labelledby="living-phases-heading" className="profile-phases">
              <div className="profile-section__header">
                <div>
                  <h2 className="profile-section__title" id="living-phases-heading">
                    Living phases
                  </h2>
                  {phases.length > 1 && <p className="profile-section__hint">Pick two to four phases to compare them.</p>}
                </div>
                {phases.length > 0 && !profileEmpty && (
                  <button type="button" className="profile-add-button" onClick={() => setEditor({ mode: 'create' })}>
                    <Plus size={16} aria-hidden="true" /> Add living phase
                  </button>
                )}
              </div>

              {phases.length > 0 && (
                <TrendsCard
                  status={trendsApi.status}
                  trends={trendsApi.trends}
                  message={trendsApi.message}
                  onRetry={trendsApi.reload}
                  onOpenPhase={billPhase ? () => setExpandedId(billPhase.id) : undefined}
                  openPhaseName={billPhase?.name}
                />
              )}

              {from && to && (
                <PhaseComparison fromName={from.name} toName={to.name} state={comparison} onClose={() => setCompareIds([])} />
              )}
              {!needsConversion && picked.length >= MIN_COMPARED_PHASES && (
                <PhaseComparisonTable entries={picked} onClose={() => setCompareIds([])} />
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
                  onUpdatePhase={phasesApi.updatePhase}
                  onAddCost={phasesApi.addFixedCost}
                  onUpdateCost={phasesApi.updateFixedCost}
                  onDeleteCost={phasesApi.deleteFixedCost}
                  billing={billing}
                  announce={announce}
                />
              )}
            </section>
          )}
        </div>
      </main>

      {phaseWizardOpen && (
        <PhaseWizard
          key={editingPhase?.id ?? 'new'}
          phase={editingPhase}
          phases={phases}
          hasCurrentPhase={hasCurrentPhase}
          defaultCurrency={latestCurrency(phases)}
          today={today}
          onClose={() => setEditor(null)}
          onSubmit={submitPhase}
        />
      )}

      {editor?.mode === 'onboarding' && profileApi.profile && (
        <OnboardingWizard
          profile={profileApi.profile}
          phases={phases}
          hasCurrentPhase={hasCurrentPhase}
          defaultCurrency={latestCurrency(phases)}
          today={today}
          onSaveProfile={profileApi.save}
          onCreatePhase={createFirstPhase}
          onClose={() => setEditor(null)}
          onFinished={() => {
            setEditor(null);
            announce('Profile saved');
          }}
        />
      )}

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
