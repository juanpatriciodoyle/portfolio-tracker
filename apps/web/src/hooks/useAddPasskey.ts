import { useEffect, useState } from 'react';
import { addPasskey } from '../lib/passkeys';
import { signInFailureMessage } from '../lib/signInFailure';
import { useTranslation } from '../i18n/useTranslation';
import { useSubmitOnce } from './useSubmitOnce';

const NOTE_SHOWN_MS = 6000;

export interface PasskeyNote {
  readonly kind: 'done' | 'failed';
  readonly text: string;
}

/**
 * Saving a passkey on the account that is signed in: one tap, the browser's own prompt, one line of feedback that
 * goes away by itself. `label` is what the browser's passkey list will show for it.
 */
export function useAddPasskey(label: string, onAdded: () => void) {
  const words = useTranslation();
  const { run, pending } = useSubmitOnce();
  const [note, setNote] = useState<PasskeyNote | null>(null);

  useEffect(() => {
    if (!note) return undefined;
    const timer = window.setTimeout(() => setNote(null), NOTE_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [note]);

  const add = () =>
    run(async () => {
      setNote(null);
      try {
        await addPasskey(label);
        setNote({ kind: 'done', text: words.t('header.passkeyAdded') });
        onAdded();
      } catch (failure) {
        setNote({ kind: 'failed', text: signInFailureMessage(failure, words, 'login.passkeyError') });
      }
    });

  return { add, pending, note };
}
