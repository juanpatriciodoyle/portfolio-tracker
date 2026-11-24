import { useCallback, useState } from 'react';
import { HumanCheckIncompleteError, type HumanCheckHandle } from '../lib/humanCheck';

/**
 * The human check that runs AFTER the person has picked Google, never up front. `siteKey` is null when the server does
 * not ask for one: then `solve()` answers undefined at once and nothing is drawn. Otherwise render `HumanCheck` with
 * `ref={attach}`, call `solve()` once Google has given its token, and `reset()` when the attempt is over, however it ended.
 */
export function useHumanCheck(siteKey: string | null) {
  const [handle, attach] = useState<HumanCheckHandle | null>(null);

  const solve = useCallback(async (): Promise<string | undefined> => {
    if (siteKey === null) return undefined;
    if (handle === null) throw new HumanCheckIncompleteError();
    return handle.execute();
  }, [siteKey, handle]);

  const reset = useCallback(() => handle?.reset(), [handle]);

  /** `attach` is the `ref` of `HumanCheck`. */
  return { siteKey, attach, solve, reset };
}
