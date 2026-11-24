import { KeyRound } from 'lucide-react';
import { useAddPasskey } from '../hooks/useAddPasskey';
import { useTranslation } from '../i18n/useTranslation';

interface AddPasskeyButtonProps {
  /** What the browser's passkey list shows for the new passkey. */
  label: string;
  /** The account already has a passkey: only the note about adding it is left to show. */
  hasPasskey: boolean;
  onAdded: () => void;
}

/** The way to save a passkey for the next sign-in: a key in the top bar, until the account has one. */
export default function AddPasskeyButton({ label, hasPasskey, onAdded }: AddPasskeyButtonProps) {
  const { t } = useTranslation();
  const { add, pending, note } = useAddPasskey(label, onAdded);

  return (
    <>
      {!hasPasskey && (
        <button type="button" className="header-icon-button" onClick={() => void add()} disabled={pending} aria-busy={pending} aria-label={t('header.addPasskey')} title={t('header.addPasskey')}>
          <KeyRound size={16} aria-hidden="true" />
        </button>
      )}
      <span role="status" className={note ? `header-note header-note--${note.kind}` : undefined}>
        {note?.text}
      </span>
    </>
  );
}
