import { LogOut } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';

interface SignOutButtonProps {
  onSignOut: () => void;
}

/** One press signs out: nobody is asked twice. */
export default function SignOutButton({ onSignOut }: SignOutButtonProps) {
  const { t } = useTranslation();

  return (
    <button type="button" className="header-icon-button" aria-label={t('header.signOut')} title={t('header.signOut')} onClick={onSignOut}>
      <LogOut size={16} aria-hidden="true" />
    </button>
  );
}
