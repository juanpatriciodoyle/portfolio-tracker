import { useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import type { CreateFixedCostRequest, LivingPhaseDto, ProfileData } from '../../contracts';
import { useStepDraft } from '../../hooks/useStepDraft';
import type { MutationResult } from '../../lib/apiErrors';
import WizardModal from '../wizard/WizardModal';
import { describeFailure } from './failureMessage';
import { phaseFailureFeedback } from './phaseFailure';
import {
  initialPhaseForm,
  phaseDraftSchema,
  validatePhaseForm,
  type PhaseFormState,
  type PhasePayload,
} from './phaseForm';
import PhaseStepFields from './PhaseStepFields';
import { PHASE_STEP_COPY, type PhaseFlowStepId } from './phaseStepCopy';
import { ONBOARDING_STEP_COPY } from './onboardingStepCopy';
import {
  ONBOARDING_STEP_FIELDS,
  onboardingStepErrors,
  profileDraftSchema,
  toProfileDraft,
  validateProfileDraft,
  type OnboardingStepId,
  type ProfileDraft,
  type ProfileFieldErrors,
} from './profileDraft';
import ProfileStepFields from './ProfileStepFields';
import { firstStepWithError, usePhaseFormFeedback } from './usePhaseFormFeedback';

interface OnboardingWizardProps {
  profile: ProfileData;
  phases: readonly LivingPhaseDto[];
  hasCurrentPhase: boolean;
  defaultCurrency: string;
  /** Today as a calendar day, from the server's clock. */
  today: string;
  onSaveProfile: (profile: ProfileData) => Promise<MutationResult>;
  onCreatePhase: (payload: PhasePayload) => Promise<MutationResult<unknown>>;
  /** Everything was saved. */
  onFinished: () => void;
  /** Closed without finishing; the answers are kept for next time. */
  onClose: () => void;
}

const draftSchema = z.object({ profile: profileDraftSchema, phase: phaseDraftSchema });

type OnboardingStep = OnboardingStepId | PhaseFlowStepId;

const PROFILE_STEPS = Object.keys(ONBOARDING_STEP_FIELDS) as OnboardingStepId[];
const isProfileStep = (step: OnboardingStep): step is OnboardingStepId => (PROFILE_STEPS as string[]).includes(step);

const hasText = (value: ProfileDraft[keyof ProfileDraft]) => (typeof value === 'string' ? value.trim() !== '' : Array.isArray(value) && value.length > 0);

/**
 * "Tell us about yourself": the details of "About you" and, for someone with no homes yet, the first
 * living phase with its bills, as one guided flow.
 */
export default function OnboardingWizard({
  profile,
  phases,
  hasCurrentPhase,
  defaultCurrency,
  today,
  onSaveProfile,
  onCreatePhase,
  onFinished,
  onClose,
}: OnboardingWizardProps) {
  const includesPhase = phases.length === 0;
  const stepIds = useMemo<OnboardingStep[]>(
    () => [...PROFILE_STEPS, ...(includesPhase ? (['place', 'dates', 'money', 'bills'] as const) : [])],
    [includesPhase]
  );
  const steps = stepIds.map((id) => ({ id, label: isProfileStep(id) ? ONBOARDING_STEP_COPY[id].label : PHASE_STEP_COPY[id].label }));

  const { values, setValues, step, setStep, resumedAtStep, discard } = useStepDraft(
    'onboarding',
    draftSchema,
    () => ({
      profile: toProfileDraft(profile),
      phase: { form: initialPhaseForm(null, { currency: defaultCurrency, stillLivingHere: !hasCurrentPhase }), costs: [] },
    }),
    stepIds.length
  );
  const { profile: draft, phase } = values;
  const feedback = usePhaseFormFeedback(phase.form, today);
  const [tried, setTried] = useState<ReadonlySet<OnboardingStepId>>(new Set());
  const [saving, setSaving] = useState(false);
  const [addingBill, setAddingBill] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** The profile is saved before the phase, and only once, even if the phase has to be retried. */
  const profileSaved = useRef(false);

  const stepId = stepIds[step];
  const copy = isProfileStep(stepId) ? ONBOARDING_STEP_COPY[stepId] : PHASE_STEP_COPY[stepId];

  const changeProfile = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setValues((previous) => ({ ...previous, profile: { ...previous.profile, [key]: value } }));
    setFormError(null);
  };
  const changePhase = <K extends keyof PhaseFormState>(key: K, value: PhaseFormState[K]) => {
    setValues((previous) => ({ ...previous, phase: { ...previous.phase, form: { ...previous.phase.form, [key]: value } } }));
    feedback.clearServerErrors();
    setFormError(null);
  };
  const changeCosts = (costs: CreateFixedCostRequest[]) => setValues((previous) => ({ ...previous, phase: { ...previous.phase, costs } }));

  const profileErrors = (target: OnboardingStepId): ProfileFieldErrors => onboardingStepErrors(draft, target);
  const profileErrorOf = (field: keyof ProfileDraft): string | undefined => {
    if (!isProfileStep(stepId)) return undefined;
    const message = profileErrors(stepId)[field];
    return message !== undefined && (tried.has(stepId) || hasText(draft[field])) ? message : undefined;
  };
  const profileValid = (field: keyof ProfileDraft) => hasText(draft[field]) && isProfileStep(stepId) && profileErrors(stepId)[field] === undefined;

  const goToStep = (target: OnboardingStep) => setStep(stepIds.indexOf(target));

  const finish = async () => {
    for (const target of PROFILE_STEPS) {
      if (Object.keys(profileErrors(target)).length > 0) {
        setTried((previous) => new Set(previous).add(target));
        goToStep(target);
        return;
      }
    }
    const profileResult = validateProfileDraft(draft);
    if (!profileResult.ok) return;

    const phaseResult = includesPhase ? validatePhaseForm(phase.form, today, phase.costs) : null;
    if (phaseResult && !phaseResult.ok) {
      feedback.tryEverything();
      const failing = firstStepWithError(phaseResult.errors);
      if (failing) goToStep(failing);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (!profileSaved.current) {
        const saved = await onSaveProfile(profileResult.profile);
        if (!saved.ok) {
          setFormError(describeFailure(saved.failure));
          return;
        }
        profileSaved.current = true;
      }

      if (phaseResult?.ok) {
        const created = await onCreatePhase(phaseResult.payload);
        if (!created.ok) {
          const { fieldErrors, message } = phaseFailureFeedback(created.failure, phases);
          feedback.showServerErrors(fieldErrors);
          setFormError(message);
          goToStep(firstStepWithError(fieldErrors) ?? 'dates');
          return;
        }
      }
    } finally {
      setSaving(false);
    }
    discard();
    onFinished();
  };

  const next = () => {
    if (isProfileStep(stepId)) {
      setTried((previous) => new Set(previous).add(stepId));
      if (Object.keys(profileErrors(stepId)).length > 0) return;
    } else if (stepId !== 'bills' && Object.keys(feedback.tryStep(stepId)).length > 0) {
      return;
    }
    if (step < stepIds.length - 1) setStep(step + 1);
    else void finish();
  };

  return (
    <WizardModal
      title="Tell us about yourself"
      steps={steps}
      stepIndex={step}
      heading={copy.heading}
      resumed={resumedAtStep === step}
      error={formError}
      busy={saving}
      hideNext={addingBill}
      finishLabel="Finish"
      onBack={() => setStep(step - 1)}
      onNext={next}
      onClose={onClose}
    >
      {isProfileStep(stepId) ? (
        <ProfileStepFields
          step={stepId}
          idPrefix="onboarding"
          draft={draft}
          onChange={changeProfile}
          errorOf={profileErrorOf}
          isValid={profileValid}
        />
      ) : (
        <PhaseStepFields
          onAddingBillChange={setAddingBill}
          step={stepId}
          idPrefix="onboarding-phase"
          form={phase.form}
          onChange={changePhase}
          feedback={feedback}
          today={today}
          costs={phase.costs}
          onCostsChange={changeCosts}
        />
      )}
    </WizardModal>
  );
}
