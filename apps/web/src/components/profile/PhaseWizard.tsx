import { useMemo, useState } from 'react';
import type { CreateFixedCostRequest, LivingPhaseDto } from '../../contracts';
import { useStepDraft } from '../../hooks/useStepDraft';
import type { MutationResult } from '../../lib/apiErrors';
import WizardModal from '../wizard/WizardModal';
import { initialPhaseForm, phaseDraftSchema, validatePhaseForm, type PhaseFormState, type PhasePayload } from './phaseForm';
import { phaseFailureFeedback } from './phaseFailure';
import PhaseStepFields from './PhaseStepFields';
import { PHASE_STEP_COPY, type PhaseFlowStepId } from './phaseStepCopy';
import { firstStepWithError, usePhaseFormFeedback } from './usePhaseFormFeedback';

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

/** Adding a home asks for its bills too; changing one leaves them to the home's own page. */
const stepsFor = (editing: boolean): PhaseFlowStepId[] => (editing ? ['place', 'dates', 'money'] : ['place', 'dates', 'money', 'bills']);

/** Add or change a living phase, one question at a time, in the middle of the screen. */
export default function PhaseWizard({ phase, phases, hasCurrentPhase, defaultCurrency, today, onClose, onSubmit }: PhaseWizardProps) {
  const stepIds = useMemo(() => stepsFor(phase !== null), [phase]);
  const steps = stepIds.map((id) => ({ id, label: PHASE_STEP_COPY[id].label }));
  const { values, setValues, step, setStep, resumedAtStep, discard } = useStepDraft(
    `phase:${phase?.id ?? 'new'}`,
    phaseDraftSchema,
    () => ({ form: initialPhaseForm(phase, { currency: defaultCurrency, stillLivingHere: !hasCurrentPhase }), costs: [] }),
    stepIds.length
  );
  const { form, costs } = values;
  const feedback = usePhaseFormFeedback(form, today);
  const [saving, setSaving] = useState(false);
  const [addingBill, setAddingBill] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const stepId = stepIds[step];
  const copy = PHASE_STEP_COPY[stepId];

  const change = <K extends keyof PhaseFormState>(key: K, value: PhaseFormState[K]) => {
    setValues((previous) => ({ ...previous, form: { ...previous.form, [key]: value } }));
    feedback.clearServerErrors();
    setFormError(null);
  };
  const changeCosts = (next: CreateFixedCostRequest[]) => setValues((previous) => ({ ...previous, costs: next }));

  const submit = async () => {
    const result = validatePhaseForm(form, today, costs);
    if (!result.ok) {
      feedback.tryEverything();
      const failing = firstStepWithError(result.errors);
      if (failing) setStep(stepIds.indexOf(failing));
      return;
    }

    setSaving(true);
    setFormError(null);
    const outcome = await onSubmit(result.payload);
    setSaving(false);
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
  };

  const next = () => {
    if (stepId !== 'bills' && Object.keys(feedback.tryStep(stepId)).length > 0) return;
    if (step < stepIds.length - 1) setStep(step + 1);
    else void submit();
  };

  return (
    <WizardModal
      title={phase ? 'Edit living phase' : 'Add a living phase'}
      steps={steps}
      stepIndex={step}
      heading={copy.heading}
      resumed={resumedAtStep === step}
      error={formError}
      busy={saving}
      hideNext={addingBill}
      finishLabel={phase ? 'Save changes' : 'Add living phase'}
      onBack={() => setStep(step - 1)}
      onNext={next}
      onClose={onClose}
    >
      <PhaseStepFields
        onAddingBillChange={setAddingBill}
        step={stepId}
        idPrefix={`phase-${phase?.id ?? 'new'}`}
        form={form}
        onChange={change}
        feedback={feedback}
        today={today}
        costs={costs}
        onCostsChange={changeCosts}
        includeIncome={phase === null}
      />
    </WizardModal>
  );
}
