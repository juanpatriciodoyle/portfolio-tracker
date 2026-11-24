import { useEffect, useState } from 'react';
import { appConfigResponse } from '../contracts';
import { apiRequest } from '../lib/apiClient';

/**
 * What the server says about itself before anyone has signed in. `demoEnabled` is null until it answers (or if it
 * never does): the sign-in screen then shows only what is certain. `captchaSiteKey` is the public key of the human
 * check when the server asks for one, and null when it does not (or has not answered).
 */
export function useAppConfig(): { demoEnabled: boolean | null; captchaSiteKey: string | null } {
  const [demoEnabled, setDemoEnabled] = useState<boolean | null>(null);
  const [captchaSiteKey, setCaptchaSiteKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/config', appConfigResponse).then(
      (config) => {
        if (cancelled) return;
        setDemoEnabled(config.demoEnabled);
        setCaptchaSiteKey(config.captchaSiteKey);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { demoEnabled, captchaSiteKey };
}
