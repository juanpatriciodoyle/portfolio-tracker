import { Fragment, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import { ANALYTICS_TAB, panelId, profileTabsFor, tabId, type ProfileTabId } from '../../lib/profileTab';

interface ProfileTabsProps {
  active: ProfileTabId;
  onChange: (id: ProfileTabId) => void;
  /** Adds the Analytics tab. */
  isAdmin?: boolean;
}

/** The tab strip: arrow keys, Home and End move between tabs; only the open one is in the Tab order. */
export default function ProfileTabs({ active, onChange, isAdmin = false }: ProfileTabsProps) {
  const { t } = useTranslation();
  const tabs = profileTabsFor(isAdmin);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const target =
      event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    const next = tabs[(target + tabs.length) % tabs.length];
    onChange(next.id);
    buttons.current[next.id]?.focus();
  };

  return (
    <div className="profile-tabs" role="tablist" aria-label={t('profile.tabs')}>
      {tabs.map((tab) => {
        const admin = tab.id === ANALYTICS_TAB.id;
        return (
          <Fragment key={tab.id}>
            {/* The admin area is not one of the person's own tabs: it sits after a rule, at the end of the row. */}
            {admin && <span className="profile-tabs__divider" aria-hidden="true" />}
            <button
              ref={(element) => {
                buttons.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={tab.id === active}
              aria-controls={panelId(tab.id)}
              tabIndex={tab.id === active ? 0 : -1}
              className={`profile-tabs__tab${admin ? ' profile-tabs__tab--admin' : ''}${tab.id === active ? ' is-active' : ''}`}
              onClick={() => onChange(tab.id)}
              onKeyDown={handleKeyDown}
            >
              {t(tab.label)}
              {/* A visual cue only: the tab keeps its plain name for assistive technology, and the panel says it again in words. */}
              {admin && (
                <span className="profile-tabs__badge" aria-hidden="true">
                  {t('profile.tab.adminBadge')}
                </span>
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
