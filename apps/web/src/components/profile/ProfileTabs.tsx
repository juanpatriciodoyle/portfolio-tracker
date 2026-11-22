import { useRef, type KeyboardEvent } from 'react';
import { panelId, profileTabsFor, tabId, type ProfileTabId } from '../../lib/profileTab';

interface ProfileTabsProps {
  active: ProfileTabId;
  onChange: (id: ProfileTabId) => void;
  /** Adds the Analytics tab. */
  isAdmin?: boolean;
}

/** The tab strip: arrow keys, Home and End move between tabs; only the open one is in the Tab order. */
export default function ProfileTabs({ active, onChange, isAdmin = false }: ProfileTabsProps) {
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
    <div className="profile-tabs" role="tablist" aria-label="Profile sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(element) => {
            buttons.current[tab.id] = element;
          }}
          type="button"
          role="tab"
          id={tabId(tab.id)}
          aria-selected={tab.id === active}
          aria-controls={panelId(tab.id)}
          tabIndex={tab.id === active ? 0 : -1}
          className={`profile-tabs__tab${tab.id === active ? ' is-active' : ''}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={handleKeyDown}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
