import { useCallback, useEffect, useState } from 'react';
import { profileResponse, type ProfileData } from '../contracts';
import { apiCommand, apiRequest } from '../lib/apiClient';
import { attempt, statusFromFailure, type LoadStatus, type MutationResult } from '../lib/apiErrors';

interface ProfileState {
  status: LoadStatus;
  message: string | null;
  profile: ProfileData | null;
}

const PROFILE_PATH = '/api/profile';

/** The signed-in person's profile (stored encrypted on the server). */
export function useProfile() {
  const [state, setState] = useState<ProfileState>({ status: 'loading', message: null, profile: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await attempt(() => apiRequest(PROFILE_PATH, profileResponse));
      if (cancelled) return;
      setState((previous) =>
        result.ok
          ? { status: 'ready', message: null, profile: result.value }
          : { ...previous, status: statusFromFailure(result.failure), message: result.failure.message }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setState((previous) => (previous.status === 'ready' ? previous : { ...previous, status: 'loading', message: null }));
    setReloadKey((key) => key + 1);
  }, []);

  const save = useCallback(async (data: ProfileData): Promise<MutationResult> => {
    const result = await attempt(() => apiCommand(PROFILE_PATH, { method: 'PUT', body: data }));
    if (result.ok) {
      setState({ status: 'ready', message: null, profile: data });
    } else if (result.failure.kind === 'signed-out' || result.failure.kind === 'encryption-unavailable') {
      const failure = result.failure;
      setState((previous) => ({ ...previous, status: statusFromFailure(failure), message: failure.message }));
    }
    return result;
  }, []);

  return { ...state, reload, save };
}
