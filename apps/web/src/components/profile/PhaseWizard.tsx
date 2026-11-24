import { useTranslation } from '../../i18n/useTranslation';
import { useMemo, useState } from 'react';
import type { LivingPhaseDto } from '../../contracts';
import { useStepDraft } from '../../hooks/useStepDraft';
import type { MutationResult } from '../../lib/apiErrors';
import WizardModal from '../wizard/WizardModal';
import { parseMajorToMinor } from '../../lib/money';
import { carriedStreams, carryCandidates } from './carryOver';
import { initialPhaseForm, phaseDraftSchema, validatePhaseForm, type PhaseFormState, type PhasePayload } from './phaseForm';
import { phaseFailureFeedback } from './phaseFailure';
import PhaseStepFields from './PhaseStepFields';
import { PHASE_STEP_COPY } from './phaseStepCopy';
import { PHASE_STEP_FIELDS, type PhaseStepId } from './phaseForm';
import { firstStepWithError, usePhaseFormFeedback } from './usePhaseFormFeedback';
import { useSubmitOnce } from '../../hooks/useSubmitOnce';

interface PhaseWizardProps {
  /** The phase being edited, or null to add a new one. */
  phase: LivingPhaseDto | null;
  /** Every phase, so an overlap can be explained by name. */
  phases: readonly LivingPhaseDto[];
  hasCurrentPhase: boolean;
  /** Pre-selected currency for a new phase. */
  defaultCurrency: string;
  /** Today as a calendar day, from the server's clock. */
  today: string;
  onClose: () => void;
  onSubmit: (payload: PhasePayload) => Promise<MutationResult<unknown>>;
}

/** The questions of a home, in order. Its bills are added through "Add expense" and never asked here. */
const STEP_IDS = Object.keys(PHASE_STEP_FIELDS) as PhaseStepId[];

/** Add or change a living phase, one question at a time, in the middle of the screen. */
export default function PhaseWizard({ phase, phases, hasCurrentPhase, defaultCurrency, today, onClose, onSubmit }: PhaseWizardProps) {
  const { t } = useTranslation();
  const stepIds = STEP_IDS;
  const steps = stepIds.map((id) => ({ id, label: t(PHASE_STEP_COPY[id].label) }));
  const { values, setValues, step, setStep, resumedAtStep, discard } = useStepDraft(
    `phase:${phase?.id ?? 'new'}`,
    phaseDraftSchema,
    () => ({ form: initialPhaseForm(phase, { currency: defaultCurrency, stillLivingHere: !hasCurrentPhase }), carry: { unticked: [], amounts: {} } }),
    stepIds.length
  );
  const { form, carry } = values;
  // A new home can keep the jobs the previous one had; changing a home never touches its income.
  const candidates = useMemo(() => (phase === null ? carryCandidates(phases, form.startDate, form.currency) : []), [phase, phases, form.startDate, form.currency]);
  const feedback = usePhaseFormFeedback(form, today);
  const { run, pending: saving } = useSubmitOnce();
  const [formError, setFormError] = useState<string | null>(null);

  const stepId = stepIds[step];
  const copy = PHASE_STEP_COPY[stepId];

  const change = <K extends keyof PhaseFormState>(key: K, value: PhaseFormState[K]) => {
    setValues((previous) => ({ ...previous, form: { ...previous.form, [key]: value } }));
    feedback.clearServerErrors();
    setFormError(null);
  };

  const submit = async () => {
    const carried = carriedStreams(candidates, carry, form.startDate, (text) => parseMajorToMinor(text, form.currency), t);
    if (!carried.ok) {
      feedback.showServerErrors({ monthlyIncome: carried.message });
      setStep(stepIds.indexOf('money'));
      return;
    }
    const result = validatePhaseForm(form, today, [], carried.streams);
    if (!result.ok) {
      feedback.tryEverything();
      const failing = firstStepWithError(result.errors);
      if (failing) setStep(stepIds.indexOf(failing));
      return;
    }

    await run(async () => {
      setFormError(null);
      const outcome = await onSubmit(result.payload);
      if (outcome.ok) {
        discard();
        return;
      }

      const { fieldErrors, message } = phaseFailureFeedback(outcome.failure, phases);
      feedback.showServerErrors(fieldErrors);
      setFormError(message);
      const failing = firstStepWithError(fieldErrors) ?? (message ? stepIds.indexOf('dates') : undefined);
      if (typeof failing === 'number') setStep(failing);
      else if (failing) setStep(stepIds.indexOf(failing));
    });
  };

  const next = () => {
    if (Object.keys(feedback.tryStep(stepId)).length > 0) return;
    if (step < stepIds.length - 1) setStep(step + 1);
    else void submit();
  };

  return (
    <WizardModal
      title={phase ? t('phaseWizard.edit') : t('phaseWizard.add')}
      steps={steps}
      stepIndex={step}
      heading={t(copy.heading)}
      resumed={resumedAtStep === step}
      error={formError}
      busy={saving}
      finishLabel={phase ? t('phaseWizard.save') : t('profile.addPhase')}
      onBack={() => setStep(step - 1)}
      onNext={next}
      onClose={onClose}
    >
      <PhaseStepFields
        step={stepId}
        idPrefix={`phase-${phase?.id ?? 'new'}`}
        form={form}
        onChange={change}
        feedback={feedback}
        today={today}
        includeIncome={phase === null}
        carry={phase === null ? { candidates, choice: carry, onChange: (choice) => setValues((previous) => ({ ...previous, carry: choice })) } : undefined}
      />
    </WizardModal>
  );
}
