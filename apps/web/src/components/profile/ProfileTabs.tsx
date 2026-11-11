import { useRef, type KeyboardEvent } from 'react';
import { PROFILE_TABS, panelId, tabId, type ProfileTabId } from '../../lib/profileTab';

interface ProfileTabsProps {
  active: ProfileTabId;
  onChange: (id: ProfileTabId) => void;
}

/** The tab strip: arrow keys, Home and End move between tabs; only the open one is in the Tab order. */
export default function ProfileTabs({ active, onChange }: ProfileTabsProps) {
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = PROFILE_TABS.findIndex((tab) => tab.id === active);
    const target =
      event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? PROFILE_TABS.length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    const next = PROFILE_TABS[(target + PROFILE_TABS.length) % PROFILE_TABS.length];
    onChange(next.id);
    buttons.current[next.id]?.focus();
  };

  return (
    <div className="profile-tabs" role="tablist" aria-label="Profile sections">
      {PROFILE_TABS.map((tab) => (
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
