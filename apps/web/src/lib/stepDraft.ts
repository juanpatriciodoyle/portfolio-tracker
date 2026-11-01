import { z } from 'zod';

const PREFIX = 'draft:';

export interface StepDraft<T> {
  /** The step the person was on. */
  step: number;
  values: T;
}

const keyOf = (key: string) => `${PREFIX}${key}`;

/**
 * What a form had when the person left it, or null when there is nothing usable: a draft that is
 * damaged or written by an older version is dropped rather than trusted.
 */
export function loadDraft<S extends z.ZodType>(storage: Storage, key: string, valuesSchema: S): StepDraft<z.output<S>> | null {
  try {
    const raw = storage.getItem(keyOf(key));
    if (raw === null) return null;
    const parsed = z.object({ step: z.number().int().min(0), values: valuesSchema }).safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as StepDraft<z.output<S>>) : null;
  } catch {
    return null;
  }
}

/** Remembers the form so it can be resumed. A full or blocked storage only means nothing is remembered. */
export function saveDraft<T>(storage: Storage, key: string, draft: StepDraft<T>): void {
  try {
    storage.setItem(keyOf(key), JSON.stringify(draft));
  } catch {
    // Drafts are a convenience: losing one must never get in the way of filling the form.
  }
}

export function clearDraft(storage: Storage, key: string): void {
  try {
    storage.removeItem(keyOf(key));
  } catch {
    // See saveDraft.
  }
}

/** Forgets every draft, for when the session ends: personal answers should not outlive it. */
export function clearAllDrafts(storage: Storage): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, position) => storage.key(position));
    for (const key of keys) if (key?.startsWith(PREFIX)) storage.removeItem(key);
  } catch {
    // See saveDraft.
  }
}
