import { Globe, LogOut, Plus } from 'lucide-react';
import { dataLabel } from '../i18n/dataLabels';
import LanguageSelector from '../i18n/LanguageSelector';
import { useTranslation } from '../i18n/useTranslation';
import ProfileAvatar from './ProfileAvatar';

interface AppHeaderProps {
  isRealInflationMode: boolean;
  onToggleInflation: () => void;
  country: string;
  onOpenCountry: () => void;
  onLogTransaction: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
}

/** The top bar: who and where on the left of the actions, one primary action, everything else quiet. */
export default function AppHeader({
  isRealInflationMode,
  onToggleInflation,
  country,
  onOpenCountry,
  onLogTransaction,
  onOpenProfile,
  onSignOut,
}: AppHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="app-header">
      <span className="app-header__brand">Portfolio Tracker</span>

      <div className="app-header__actions">
        <button
          type="button"
          role="switch"
          aria-checked={isRealInflationMode}
          aria-label={t('header.adjustInflation')}
          className="inflation-switch"
          title={t('header.adjustInflationHint')}
          onClick={onToggleInflation}
        >
          <span className="inflation-switch__track" aria-hidden="true">
            <span className="inflation-switch__thumb" />
          </span>
          <span aria-hidden="true">{t('header.adjustInflation')}</span>
        </button>

        <LanguageSelector />

        <button type="button" className="header-chip" onClick={onOpenCountry} title={t('header.countryHint')}>
          <Globe size={14} aria-hidden="true" />
          {dataLabel(t, 'country', country)}
        </button>

        <button type="button" className="header-primary" onClick={onLogTransaction} aria-label={t('header.logTransaction')}>
          <Plus size={16} aria-hidden="true" />
          <span className="header-primary__label" aria-hidden="true">{t('header.logTransaction')}</span>
        </button>

        <ProfileAvatar onOpen={onOpenProfile} />

        <button type="button" className="header-icon-button" onClick={onSignOut} aria-label={t('header.signOut')} title={t('header.signOut')}>
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
