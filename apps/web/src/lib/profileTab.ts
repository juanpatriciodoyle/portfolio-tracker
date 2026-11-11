/** The two halves of the profile page. Order here is the order on screen. */
export const PROFILE_TABS = [
  { id: 'living', label: 'Living Costs & Career' },
  { id: 'milestones', label: 'Milestones & Positioning' },
] as const;

export type ProfileTabId = (typeof PROFILE_TABS)[number]['id'];

const STORAGE_KEY = 'profile-tab';
const isProfileTab = (value: string | null): value is ProfileTabId => PROFILE_TABS.some((tab) => tab.id === value);

/** The tab left open last time in this browser tab; the first one when there is none or storage is unavailable. */
export function readProfileTab(storage: Pick<Storage, 'getItem'> = sessionStorage): ProfileTabId {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    return isProfileTab(stored) ? stored : PROFILE_TABS[0].id;
  } catch {
    return PROFILE_TABS[0].id;
  }
}

export function storeProfileTab(id: ProfileTabId, storage: Pick<Storage, 'setItem'> = sessionStorage): void {
  try {
    storage.setItem(STORAGE_KEY, id);
  } catch {
    // Remembering the tab is a convenience: without storage the page simply opens on the first one.
  }
}

/** Ids that tie a tab to its panel, for screen readers. */
export const tabId = (id: ProfileTabId) => `profile-tab-${id}`;
export const panelId = (id: ProfileTabId) => `profile-panel-${id}`;
