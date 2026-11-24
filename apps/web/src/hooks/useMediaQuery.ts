import { useSyncExternalStore } from 'react';

const listFor = (query: string): MediaQueryList | null => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);

/** Whether a CSS media query matches right now, and again whenever that changes. False where the browser cannot tell. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = listFor(query);
      list?.addEventListener('change', notify);
      return () => list?.removeEventListener('change', notify);
    },
    () => listFor(query)?.matches ?? false,
    () => false
  );
}
