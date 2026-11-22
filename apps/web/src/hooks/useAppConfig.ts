import { useEffect, useState } from 'react';
import { appConfigResponse } from '../contracts';
import { apiRequest } from '../lib/apiClient';

/**
 * What the server says about itself before anyone has signed in. `demoEnabled` is null until it answers (or if it
 * never does): the sign-in screen then shows only what is certain.
 */
export function useAppConfig(): { demoEnabled: boolean | null } {
  const [demoEnabled, setDemoEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/config', appConfigResponse).then(
      (config) => {
        if (!cancelled) setDemoEnabled(config.demoEnabled);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { demoEnabled };
}
