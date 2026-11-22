/** The two halves of the profile page. Order here is the order on screen. */
export const PROFILE_TABS = [
  { id: 'living', label: 'Living Costs & Career' },
  { id: 'milestones', label: 'Milestones & Positioning' },
] as const;

/** The third tab, for the admin only. The server decides who may read what is in it; this only decides who sees the tab. */
export const ANALYTICS_TAB = { id: 'analytics', label: 'Analytics' } as const;

export type ProfileTabId = (typeof PROFILE_TABS)[number]['id'] | (typeof ANALYTICS_TAB)['id'];

/** The tabs a person sees, in the order they show. */
export const profileTabsFor = (isAdmin: boolean): readonly { id: ProfileTabId; label: string }[] =>
  isAdmin ? [...PROFILE_TABS, ANALYTICS_TAB] : PROFILE_TABS;

const STORAGE_KEY = 'profile-tab';

/** The tab left open last time in this browser tab; the first one when there is none, storage is unavailable, or the tab is not one this person has. */
export function readProfileTab(storage: Pick<Storage, 'getItem'> = sessionStorage, isAdmin = false): ProfileTabId {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    return profileTabsFor(isAdmin).find((tab) => tab.id === stored)?.id ?? PROFILE_TABS[0].id;
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
