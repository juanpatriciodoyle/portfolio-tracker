import { useCallback, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const readHash = () => window.location.hash;
const readHashOnServer = () => '';

export const PROFILE_PATH = '/profile';

/** A tiny hash-based route ('#/profile'), so the browser's back button works without a router. */
export function useHashRoute() {
  const hash = useSyncExternalStore(subscribe, readHash, readHashOnServer);
  const path = hash.replace(/^#/, '') || '/';
  const navigate = useCallback((to: string) => {
    window.location.hash = to;
  }, []);
  return { path, navigate };
}
