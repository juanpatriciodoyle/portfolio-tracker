import type { ReactNode } from 'react';
import { Globe, Plus } from 'lucide-react';
import { dataLabel } from '../i18n/dataLabels';
import LanguageSelector from '../i18n/LanguageSelector';
import { useTranslation } from '../i18n/useTranslation';
import ProfileAvatar from './ProfileAvatar';
import SignOutButton from './SignOutButton';

interface AppHeaderProps {
  isRealInflationMode: boolean;
  onToggleInflation: () => void;
  country: string;
  onOpenCountry: () => void;
  onLogTransaction: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  /** Saves a passkey on the signed-in account; only given to accounts that may have one. */
  passkeyAction?: ReactNode;
  /** The session is the demo guest: the header says the figures are samples. */
  isGuest?: boolean;
}

/** The top bar: the name of the app (and the Demo chip) on the left, one primary action, everything else quiet. */
export default function AppHeader({
  isRealInflationMode,
  onToggleInflation,
  country,
  onOpenCountry,
  onLogTransaction,
  onOpenProfile,
  onSignOut,
  passkeyAction,
  isGuest = false,
}: AppHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="app-header">
      {/* Who this is: the name of the app, and for the demo guest the reminder that the figures are samples. */}
      <div className="app-header__lead">
        <span className="app-header__brand">Portfolio Tracker</span>
        {isGuest && (
          <span className="demo-chip" role="note" title={t('header.demoHint')} aria-label={t('header.demoLabel')}>
            {t('header.demo')}
          </span>
        )}
      </div>

      <div className="app-header__actions">
        {/* What the figures are measured in: kept together, so on a phone they sit on a row of their own. */}
        <div className="app-header__inflation">
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
            <span aria-hidden="true" className="inflation-switch__label">
              {t('header.adjustInflation')}
            </span>
            <span aria-hidden="true" className="inflation-switch__label inflation-switch__label--short">
              {t('header.adjustInflationShort')}
            </span>
          </button>

          <button type="button" className="header-chip" onClick={onOpenCountry} title={t('header.countryHint')}>
            <Globe size={14} aria-hidden="true" />
            {t('header.countryChip', { country: dataLabel(t, 'country', country) })}
          </button>
        </div>

        <div className="app-header__tools">
          <LanguageSelector />

          <button type="button" className="header-primary" onClick={onLogTransaction} aria-label={t('header.logTransaction')}>
            <Plus size={16} aria-hidden="true" />
            <span className="header-primary__label" aria-hidden="true">{t('header.logTransaction')}</span>
          </button>

          {passkeyAction}

          <ProfileAvatar onOpen={onOpenProfile} />

          <SignOutButton onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}
