import { ENCRYPTION_NOT_CONFIGURED, phaseOverlapErrorResponse, validationErrorResponse } from '../contracts';
import { ApiContractError, ApiError } from './apiClient';

/** What a failed call means for the screen, so components never inspect status codes. */
export type ApiFailure =
  | { kind: 'signed-out'; message: string }
  | { kind: 'encryption-unavailable'; message: string }
  | { kind: 'validation'; message: string; issues: { path: string; message: string }[] }
  | { kind: 'overlap'; message: string; conflictingPhaseIds: string[] }
  | { kind: 'not-found'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'unknown'; message: string };

export type LoadStatus = 'loading' | 'ready' | 'error' | 'signed-out' | 'encryption-unavailable';

export type MutationResult<T = void> = { ok: true; value: T } | { ok: false; failure: ApiFailure };

export function classifyApiError(error: unknown): ApiFailure {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return { kind: 'signed-out', message: 'Your session has ended. Sign in again to continue.' };
    }
    if (error.status === 503 && (error.body as { code?: unknown } | null)?.code === ENCRYPTION_NOT_CONFIGURED) {
      return { kind: 'encryption-unavailable', message: error.message };
    }
    if (error.status === 400) {
      const parsed = validationErrorResponse.safeParse(error.body);
      if (parsed.success) return { kind: 'validation', message: parsed.data.error, issues: parsed.data.issues };
    }
    if (error.status === 409) {
      const parsed = phaseOverlapErrorResponse.safeParse(error.body);
      if (parsed.success) {
        return { kind: 'overlap', message: parsed.data.error, conflictingPhaseIds: parsed.data.conflictingPhaseIds };
      }
    }
    if (error.status === 404) return { kind: 'not-found', message: error.message };
    return { kind: 'unknown', message: error.message };
  }
  if (error instanceof ApiContractError) {
    return { kind: 'unknown', message: 'The server sent something this version of the app does not understand.' };
  }
  if (error instanceof TypeError) {
    return { kind: 'network', message: 'Could not reach the server. Check your connection and try again.' };
  }
  return { kind: 'unknown', message: error instanceof Error ? error.message : 'Something went wrong.' };
}

/** Runs an API call and turns a thrown error into a typed result. */
export async function attempt<T>(action: () => Promise<T>): Promise<MutationResult<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return { ok: false, failure: classifyApiError(error) };
  }
}

export function statusFromFailure(failure: ApiFailure): LoadStatus {
  if (failure.kind === 'signed-out' || failure.kind === 'encryption-unavailable') return failure.kind;
  return 'error';
}

const STATUS_PRIORITY: LoadStatus[] = ['signed-out', 'encryption-unavailable', 'error', 'loading', 'ready'];

/** The page shows one banner: the most important state across everything it loads. */
export function combineStatuses(...statuses: LoadStatus[]): LoadStatus {
  return STATUS_PRIORITY.find((status) => statuses.includes(status)) ?? 'ready';
}
