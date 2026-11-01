import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { z } from 'zod';
import { clearDraft, loadDraft, saveDraft } from '../lib/stepDraft';

/** The tab's own storage: it survives a refresh and closing the dialog, but not the end of the session. */
function draftStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The answers and current step of a guided flow, kept as a draft after every change so that closing
 * the dialog or refreshing the page resumes exactly where the person was. `discard` forgets it for good.
 */
export function useStepDraft<S extends z.ZodType>(key: string, schema: S, initial: () => z.output<S>, stepCount: number) {
  const [restored] = useState(() => {
    const storage = draftStorage();
    return storage ? loadDraft(storage, key, schema) : null;
  });
  const [values, setValues] = useState<z.output<S>>(() => restored?.values ?? initial());
  const [step, setStepState] = useState(() => Math.min(restored?.step ?? 0, stepCount - 1));
  // Opening a flow and leaving it untouched is not worth remembering.
  const [untouched] = useState(() => JSON.stringify(values));
  const discarded = useRef(false);

  useEffect(() => {
    const storage = draftStorage();
    if (!storage || discarded.current || (step === 0 && JSON.stringify(values) === untouched)) return;
    saveDraft(storage, key, { step, values });
  }, [key, step, values, untouched]);

  const setStep: Dispatch<SetStateAction<number>> = useCallback(
    (next) => setStepState((current) => Math.max(0, Math.min(typeof next === 'function' ? next(current) : next, stepCount - 1))),
    [stepCount]
  );

  const discard = useCallback(() => {
    discarded.current = true;
    const storage = draftStorage();
    if (storage) clearDraft(storage, key);
  }, [key]);

  /** The step a draft was brought back to, so the flow can say it picked up where the person left off. */
  const [resumedAtStep] = useState(() => (restored ? Math.min(restored.step, stepCount - 1) : null));

  return { values, setValues, step, setStep, resumedAtStep, discard };
}
