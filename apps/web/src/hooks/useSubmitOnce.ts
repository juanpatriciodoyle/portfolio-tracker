import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lets an action that writes to the server run once per intent. Two taps (or a tap and Enter) can land in the
 * same frame, before React has re-rendered a disabled button, so the guard is a ref set synchronously:
 * `run` answers `undefined` without calling the action while a previous run is still in flight.
 * It opens again when that run ends, however it ends, so a refused save can be tried again.
 * `pending` is the same fact for the screen: disable the control and mark it busy while it is true.
 */
export function useSubmitOnce() {
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(<T>(action: () => Promise<T>): Promise<T> | undefined => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);

    const finish = () => {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    };

    let running: Promise<T>;
    try {
      running = action();
    } catch (error) {
      finish();
      throw error;
    }
    return running.finally(finish);
  }, []);

  return { run, pending };
}
