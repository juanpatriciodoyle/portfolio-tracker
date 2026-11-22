import { Globe, LogOut, Plus } from 'lucide-react';
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
  return (
    <header className="app-header">
      <span className="app-header__brand">Portfolio Tracker</span>

      <div className="app-header__actions">
        <button
          type="button"
          role="switch"
          aria-checked={isRealInflationMode}
          aria-label="Adjust for inflation"
          className="inflation-switch"
          title="Show every figure in today's purchasing power"
          onClick={onToggleInflation}
        >
          <span className="inflation-switch__track" aria-hidden="true">
            <span className="inflation-switch__thumb" />
          </span>
          <span aria-hidden="true">Adjust for inflation</span>
        </button>

        <button type="button" className="header-chip" onClick={onOpenCountry} title="The country whose inflation is used">
          <Globe size={14} aria-hidden="true" />
          {country}
        </button>

        <button type="button" className="header-primary" onClick={onLogTransaction} aria-label="Log Transaction">
          <Plus size={16} aria-hidden="true" />
          <span className="header-primary__label" aria-hidden="true">Log Transaction</span>
        </button>

        <ProfileAvatar onOpen={onOpenProfile} />

        <button type="button" className="header-icon-button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
