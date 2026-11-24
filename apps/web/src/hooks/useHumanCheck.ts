import { useCallback, useMemo, useState } from 'react';

/** What the check widget needs from the hook: where to report, and when to start over. */
export interface HumanCheckWidgetProps {
  readonly siteKey: string;
  readonly onToken: (token: string) => void;
  readonly onExpire: () => void;
  /** Goes up each time the widget must start over (its answer is single-use). */
  readonly resetCount: number;
}

/**
 * The human check before Google sign-in and the demo. `siteKey` is null when the server does not ask for one: then
 * nothing is required and there is no widget. Otherwise `token` is the answer to send with the request (null until the
 * person has passed the check), and `reset()` must follow every attempt, however it ended, because an answer works once.
 */
export function useHumanCheck(siteKey: string | null) {
  const [token, setToken] = useState<string | null>(null);
  const [resetCount, setResetCount] = useState(0);

  const reset = useCallback(() => {
    setToken(null);
    setResetCount((count) => count + 1);
  }, []);
  const onExpire = useCallback(() => setToken(null), []);

  const widget = useMemo<HumanCheckWidgetProps | null>(
    () => (siteKey === null ? null : { siteKey, onToken: setToken, onExpire, resetCount }),
    [siteKey, onExpire, resetCount]
  );

  return { required: siteKey !== null, token: siteKey === null ? null : token, reset, widget };
}
