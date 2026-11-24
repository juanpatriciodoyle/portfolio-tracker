import LanguageSelector from '../../i18n/LanguageSelector';
import { useTranslation } from '../../i18n/useTranslation';
import { ArrowLeft, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CreateBillingRecordRequest, CreateFixedCostRequest, LivingPhaseDto, TimelineEntryDto } from '../../contracts';
import { useBillingRecords } from '../../hooks/useBillingRecords';
import { useResumableFlow } from '../../hooks/useStepDraft';
import { useLivingPhases } from '../../hooks/useLivingPhases';
import { usePhaseComparison } from '../../hooks/usePhaseComparison';
import { useProfile } from '../../hooks/useProfile';
import { useBenchmarks } from '../../hooks/useBenchmarks';
import { useCapitalHorizon } from '../../hooks/useCapitalHorizon';
import { useSecondSalary } from '../../hooks/useSecondSalary';
import BenchmarksCard from './BenchmarksCard';
import CapitalHorizonCard from '../CapitalHorizonCard';
import SecondSalaryCard from '../SecondSalaryCard';
import { combineStatuses, type MutationResult } from '../../lib/apiErrors';
import { defaultExpensePhase } from '../../lib/phaseRouting';
import { vendorHistory } from './vendorHistory';
import type { BillFormContext } from './billForm';
import type { BillingView } from './billingView';
import { findRenewedCost } from './costRenewal';
import { describeCostAdded } from './costToast';
import ExpenseWizard from './ExpenseWizard';
import { MAX_COMPARED_PHASES, MIN_COMPARED_PHASES } from './comparisonTable';
import PhaseComparison from './PhaseComparison';
import PhaseComparisonTable from './PhaseComparisonTable';
import NextStepCard from './NextStepCard';
import OnboardingWizard from './OnboardingWizard';
import { onboardingDraftSchema } from './onboardingFlow';
import PhaseWizard from './PhaseWizard';
import type { PhasePayload } from './phaseForm';
import { isProfileEmpty } from './profileDraft';
import PhaseTimeline from './PhaseTimeline';
import ProfileForm from './ProfileForm';
import ProfileTabs from './ProfileTabs';
import { panelId, profileTabsFor, readProfileTab, storeProfileTab, tabId, type ProfileTabId } from '../../lib/profileTab';
import { useUsageAnalytics } from '../../hooks/useUsageAnalytics';
import { intlLocale } from '../../i18n/locale';
import UsageAnalytics from './UsageAnalytics';
import SkipLink, { MAIN_CONTENT_ID } from '../SkipLink';
import './profile.css';

interface ProfilePageProps {
  /** Back to the dashboard. */
  onBack: () => void;
  /** The session has ended: return to sign-in. */
  onSignedOut: () => void;
  /** The admin sees an Analytics tab. The server decides who may read it; this only decides who is shown the tab. */
  isAdmin?: boolean;
  /** What the account already greets the person with: the first-time flow uses it as their name instead of asking. */
  accountName?: string;
  /** Opens Log Transaction on the dashboard; offered once the first home is saved. */
  onLogTransaction?: () => void;
}

/** How long the note about a new cost stays on screen. */
const TOAST_MS = 7000;
/** The key of the first-time flow's draft and of the note that it is open. */
const ONBOARDING_KEY = 'onboarding';

type EditorState = { mode: 'create' } | { mode: 'edit'; phaseId: string } | { mode: 'onboarding' } | null;

/** The currency of the most recent home, as a sensible default for the next one. */
function latestCurrency(phases: readonly LivingPhaseDto[]): string {
  return [...phases].sort((a, b) => b.startDate.localeCompare(a.startDate))[0]?.currency ?? 'EUR';
}

export default function ProfilePage({ onBack, onSignedOut, isAdmin = false, accountName, onLogTransaction }: ProfilePageProps) {
  const { t, locale } = useTranslation();
  const phasesApi = useLivingPhases();
  const profileApi = useProfile();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  // A refresh while the first-time flow was open brings it back on the step the person was on; coming back later does not.
  const onboardingFlow = useResumableFlow(ONBOARDING_KEY, onboardingDraftSchema);
  const [editor, setEditor] = useState<EditorState>(() => (onboardingFlow.resumable ? { mode: 'onboarding' } : null));
  const [announcement, setAnnouncement] = useState('');
  const [expenseOpen, setExpenseOpen] = useState(false);
  /** Set once the first home is saved, until it is dismissed: what to do next. */
  const [firstHomeSaved, setFirstHomeSaved] = useState(false);
  /** What the last bill or cost did to what is kept each month; shown for a few seconds. */
  const [toast, setToast] = useState<string | null>(null);
  /** The added cost waiting for the timeline to reload, so the toast can say what it changed. */
  const pendingToast = useRef<{ phaseId: string; entries: readonly TimelineEntryDto[]; message: (keptAfter: number | null) => string } | null>(null);
  const [openedTab, setTab] = useState<ProfileTabId>(() => readProfileTab(undefined, isAdmin));
  // A tab this person does not have (remembered from another session) opens as the first one.
  const tab = profileTabsFor(isAdmin).some((candidate) => candidate.id === openedTab) ? openedTab : profileTabsFor(isAdmin)[0].id;
  const openTab = (next: ProfileTabId) => {
    setTab(next);
    storeProfileTab(next);
  };

  const { phases, entries } = phasesApi;
  // Bills and benchmarks depend on the phases: they load once those are ready and again whenever they change.
  const dataReady = phasesApi.status === 'ready';
  const benchmarksApi = useBenchmarks(dataReady, entries);
  // The goals read the portfolio and the costs of the home lived in today, so they follow the phases.
  const { secondSalary, saveTarget: saveSecondSalaryTarget } = useSecondSalary(dataReady, entries);
  const { capitalHorizon, save: saveCapitalMilestones } = useCapitalHorizon(dataReady, entries);
  // A bill moves the monthly costs of its phase, so the timeline reloads after it.
  const afterBillChange = phasesApi.reload;
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
  const status = combineStatuses(phasesApi.status, profileApi.status);
  const announce = useCallback((message: string) => setAnnouncement(message), []);

  // Comparing needs two homes; with one, nothing is ever picked.
  const picked = (phases.length > 1 ? compareIds : [])
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
  // With a home saved there is nothing left to start: what is missing is asked later, from the demographics card.
  const profileEmpty = profileApi.status === 'ready' && profileApi.profile !== null && isProfileEmpty(profileApi.profile) && phases.length === 0;
  // Until the profile is filled in, one button leads the way into the first home: there is nothing to put in tabs yet.
  // The administrator is the exception: their own account may be empty (a first sign-in) and the Analytics tab is still theirs,
  // so the strip is always there, with the first tab holding the same single button.
  const showTabs = dataReady && (isAdmin || !(profileEmpty && phases.length === 0));
  // The figures are read only for the admin, and only while their tab is open.
  const usage = useUsageAnalytics(isAdmin && showTabs && tab === 'analytics');

  // An expense is added from one place: a bill lands in the home its days fall in, what something costs every so often in the home lived in today.
  const expensePhase = defaultExpensePhase(phases, today);
  const expenseContext: BillFormContext = { today: phasesApi.asOf, countryCode: expensePhase?.countryCode ?? null, history };

  /** After a cost is added, says what it is and what it did to what is kept: the timeline reloads, then the toast shows. */
  const expectToast = (phase: LivingPhaseDto, added: { category: CreateFixedCostRequest['category']; amountMinor: number; cadence: CreateBillingRecordRequest['cadence'] }) => {
    const keptBefore = entries.find((entry) => entry.phaseId === phase.id)?.savingsRate ?? null;
    pendingToast.current = {
      phaseId: phase.id,
      entries,
      message: (keptAfter) => describeCostAdded({ ...added, currency: phase.currency, keptBefore, keptAfter }, intlLocale(locale), t),
    };
  };

  useEffect(() => {
    const pending = pendingToast.current;
    if (!pending || entries === pending.entries) return;
    pendingToast.current = null;
    setToast(pending.message(entries.find((entry) => entry.phaseId === pending.phaseId)?.savingsRate ?? null));
  }, [entries]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const addBill = async (input: CreateBillingRecordRequest) => {
    const phase = phases.find((candidate) => candidate.id === input.phaseId);
    const result = await billsApi.createBill(input);
    if (result.ok) {
      announce(t('profile.announce.expenseAdded', { name: phase?.name ?? t('profile.yourHome') }));
      if (phase) expectToast(phase, input);
    }
    return result;
  };

  /** A fixed rate renews the declared cost of the same name instead of duplicating it. */
  const addRate = async (phase: LivingPhaseDto, input: CreateFixedCostRequest) => {
    const renewed = findRenewedCost(phase, input);
    const result = renewed ? await phasesApi.updateFixedCost(phase.id, renewed.id, input) : await phasesApi.addFixedCost(phase.id, input);
    if (result.ok) {
      announce(t(renewed ? 'profile.announce.costUpdated' : 'profile.announce.costAdded', { name: phase.name }));
      expectToast(phase, input);
    }
    return result;
  };

  const openOnboarding = () => {
    onboardingFlow.opened();
    setEditor({ mode: 'onboarding' });
  };
  const closeOnboarding = () => {
    onboardingFlow.closed();
    setEditor(null);
  };

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
        announce(t('profile.announce.phaseUpdated'));
      }
      return result;
    }
    const result = await phasesApi.createPhase(payload.create);
    if (result.ok) {
      setEditor(null);
      setExpandedId(result.value.id);
      announce(t('profile.announce.phaseAdded'));
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
      announce(t('profile.announce.phaseDeleted'));
    }
    return result;
  };

  return (
    <div className="profile-page">
      <SkipLink />
      <header className="profile-page__header">
        <button type="button" className="profile-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> {t('profile.back')}
        </button>
        <h1 className="profile-page__title">{t('profile.title')}</h1>
        <LanguageSelector />
      </header>

      <main className="profile-page__main" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <div className="profile-page__content">
          {status === 'signed-out' && (
            <div className="profile-banner profile-banner--warning" role="alert">
              <p>{t('profile.signedOut')}</p>
              <button type="button" className="btn-primary-apply profile-banner__action" onClick={onSignedOut}>
                {t('profile.signInAgain')}
              </button>
            </div>
          )}
          {status === 'encryption-unavailable' && (
            <div className="profile-banner profile-banner--warning" role="alert">
              <p>
                <strong>{t('profile.encryption.title')}</strong>
                {t('profile.encryption.before')}
                <code>PROFILE_ENCRYPTION_KEY</code>
                {t('profile.encryption.middle')}
                <code>apps/api/.env</code>
                {t('profile.encryption.after')}
              </p>
              <button type="button" className="btn-secondary-cancel profile-banner__action" onClick={retry}>
                {t('common.tryAgain')}
              </button>
            </div>
          )}
          {status === 'error' && (
            <div className="profile-banner profile-banner--error" role="alert">
              <p>{phasesApi.message ?? profileApi.message ?? t('profile.errorFallback')}</p>
              <button type="button" className="btn-secondary-cancel profile-banner__action" onClick={retry}>
                {t('common.tryAgain')}
              </button>
            </div>
          )}
          {status === 'loading' && (
            <p className="profile-page__loading" role="status">
              {t('common.loading')}
            </p>
          )}

          {firstHomeSaved && showTabs && (
            <NextStepCard
              monthlyCostsMinor={(entries.find((entry) => entry.status === 'current') ?? entries[0])?.monthlyFixedCostsMinor ?? null}
              currency={(entries.find((entry) => entry.status === 'current') ?? entries[0])?.currency ?? 'EUR'}
              onLogTransaction={onLogTransaction}
              onDismiss={() => setFirstHomeSaved(false)}
            />
          )}

          {showTabs ? (
            <>
              <ProfileTabs active={tab} onChange={openTab} isAdmin={isAdmin} />

              {tab === 'living' && (
                <div role="tabpanel" id={panelId('living')} aria-labelledby={tabId('living')} className="profile-panel">
                <section aria-labelledby="living-phases-heading" className="profile-phases">
                  <div className="profile-section__header">
                    <h2 className="profile-section__title" id="living-phases-heading">
                      {t('profile.livingPhases')}
                    </h2>
                    {phases.length > 0 && !profileEmpty && (
                      <div className="profile-section__actions">
                        <button type="button" className="profile-action-button profile-action-button--primary" onClick={() => setExpenseOpen(true)}>
                          <Plus size={16} aria-hidden="true" /> {t('profile.addExpense')}
                        </button>
                        <button type="button" className="profile-action-button profile-action-button--outline" onClick={() => setEditor({ mode: 'create' })}>
                          <Plus size={16} aria-hidden="true" /> {t('profile.addPhase')}
                        </button>
                      </div>
                    )}
                  </div>

                  {from && to && (
                    <PhaseComparison fromName={from.name} toName={to.name} state={comparison} onClose={() => setCompareIds([])} />
                  )}
                  {!needsConversion && picked.length >= MIN_COMPARED_PHASES && (
                    <PhaseComparisonTable entries={picked} onClose={() => setCompareIds([])} />
                  )}

                  {phases.length === 0 ? (
                    // With no profile either, the single first-time card below leads the way: one button, not two.
                    profileEmpty ? null : (
                    <div className="profile-card profile-empty">
                      <h3 className="profile-empty__title">{t('profile.whereLived')}</h3>
                      <button type="button" className="btn-primary-apply profile-empty__action" onClick={() => setEditor({ mode: 'create' })}>
                        {t('profile.addFirstPhase')}
                      </button>
                    </div>
                    )
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
                      onUpdateCost={phasesApi.updateFixedCost}
                      onDeleteCost={phasesApi.deleteFixedCost}
                      billing={billing}
                      announce={announce}
                    />
                  )}
                </section>
              {profileApi.status === 'ready' && profileApi.profile && profileEmpty && (
                <section className="profile-card profile-empty" aria-label={t('profile.aboutYou')}>
                  <h2 className="profile-empty__title">{t('profile.aboutYou')}</h2>
                  <button type="button" className="btn-primary-apply profile-empty__action" onClick={openOnboarding}>
                    {t('profile.tellUs')}
                  </button>
                </section>
              )}
              {profileApi.status === 'ready' && profileApi.profile && !profileEmpty && (
                <ProfileForm profile={profileApi.profile} onSave={profileApi.save} announce={announce} />
              )}
                </div>
              )}

              {tab === 'milestones' && (
                <div role="tabpanel" id={panelId('milestones')} aria-labelledby={tabId('milestones')} className="profile-panel">
                  {secondSalary && <SecondSalaryCard secondSalary={secondSalary} onSaveTarget={saveSecondSalaryTarget} />}
                  {capitalHorizon && <CapitalHorizonCard capitalHorizon={capitalHorizon} onSave={saveCapitalMilestones} />}
                  {expensePhase && billing.benchmarks && (
                    <div className="profile-card">
                      <BenchmarksCard phaseId={expensePhase.id} view={billing.benchmarks} />
                    </div>
                  )}
                </div>
              )}

              {isAdmin && tab === 'analytics' && (
                <div role="tabpanel" id={panelId('analytics')} aria-labelledby={tabId('analytics')} className="profile-panel">
                  <UsageAnalytics status={usage.status} message={usage.message} analytics={usage.analytics} onRetry={usage.reload} />
                </div>
              )}
            </>
          ) : (
            <>
          {profileApi.status === 'ready' && profileApi.profile && profileEmpty && (
            <section className="profile-card profile-empty" aria-label={t('profile.aboutYou')}>
              <h2 className="profile-empty__title">{t('profile.aboutYou')}</h2>
              <button type="button" className="btn-primary-apply profile-empty__action" onClick={openOnboarding}>
                {t('profile.tellUs')}
              </button>
            </section>
          )}
          {profileApi.status === 'ready' && profileApi.profile && !profileEmpty && (
            <ProfileForm profile={profileApi.profile} onSave={profileApi.save} announce={announce} />
          )}
            </>
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
          accountName={accountName ?? null}
          defaultCurrency={latestCurrency(phases)}
          today={today}
          onSaveProfile={profileApi.save}
          onCreatePhase={createFirstPhase}
          onClose={closeOnboarding}
          onFinished={() => {
            closeOnboarding();
            setFirstHomeSaved(true);
            announce(t('profile.announce.saved'));
          }}
        />
      )}

      {expenseOpen && expensePhase && (
        <ExpenseWizard
          phases={phases}
          context={expenseContext}
          openedFromPhaseId={expensePhase.id}
          onSubmitReceipt={addBill}
          onSubmitRate={addRate}
          onClose={() => setExpenseOpen(false)}
        />
      )}

      {toast && (
        <p className="profile-toast" role="status">
          {toast}
        </p>
      )}

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
