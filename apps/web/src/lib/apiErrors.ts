import {
  DOCUMENT_ERROR_CODES,
  ENCRYPTION_NOT_CONFIGURED,
  INTERNAL_ERROR_MESSAGE,
  INVALID_REQUEST_MESSAGE,
  duplicateBillingRecordErrorResponse,
  phaseOverlapErrorResponse,
  validationErrorResponse,
  type DocumentErrorCode,
} from '../contracts';
import { ApiContractError, ApiError } from './apiClient';

/** What a failed call means for the screen, so components never inspect status codes. */
export type ApiFailure =
  | { kind: 'signed-out'; message: string }
  | { kind: 'encryption-unavailable'; message: string }
  | { kind: 'validation'; message: string; issues: { path: string; message: string }[] }
  | { kind: 'overlap'; message: string; conflictingPhaseIds: string[] }
  | { kind: 'duplicate'; message: string; existingRecordId: string }
  | { kind: 'document'; message: string; code: DocumentErrorCode }
  | { kind: 'not-found'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'unknown'; message: string };

export type LoadStatus = 'loading' | 'ready' | 'error' | 'signed-out' | 'encryption-unavailable';

export type MutationResult<T = void> = { ok: true; value: T } | { ok: false; failure: ApiFailure };

const RAW_SERVER_TEXT = /^(internal server error|bad gateway|service unavailable|gateway timeout|request failed|error)\.?$/i;

/**
 * What a failed call says on screen. A message the server wrote on purpose is kept; a bare status
 * text ("Internal Server Error") becomes advice about what happened and what to do next.
 */
function readableMessage(error: ApiError): string {
  const written = (error.body as { error?: unknown } | null)?.error;
  const serverWrote = typeof written === 'string' && written.trim() !== '' && !RAW_SERVER_TEXT.test(written.trim());
  if (serverWrote) return written;
  if (error.status >= 500) return INTERNAL_ERROR_MESSAGE;
  if (error.status === 400) return INVALID_REQUEST_MESSAGE;
  if (error.status === 404) return 'That could not be found. It may have been removed elsewhere.';
  if (error.status === 429) return 'Too many attempts in a short time. Wait a minute and try again.';
  return 'That could not be completed. Check the information and try again.';
}

export function classifyApiError(error: unknown): ApiFailure {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return { kind: 'signed-out', message: 'Your session has ended. Sign in again to continue.' };
    }
    if (error.status === 503 && (error.body as { code?: unknown } | null)?.code === ENCRYPTION_NOT_CONFIGURED) {
      return { kind: 'encryption-unavailable', message: readableMessage(error) };
    }
    if (error.status === 400) {
      const parsed = validationErrorResponse.safeParse(error.body);
      if (parsed.success) return { kind: 'validation', message: parsed.data.error, issues: parsed.data.issues };
    }
    const code = (error.body as { code?: unknown } | null)?.code;
    const documentCode = DOCUMENT_ERROR_CODES.find((known) => known === code);
    if (documentCode) return { kind: 'document', code: documentCode, message: readableMessage(error) };
    if (error.status === 409) {
      const duplicate = duplicateBillingRecordErrorResponse.safeParse(error.body);
      if (duplicate.success) return { kind: 'duplicate', message: duplicate.data.error, existingRecordId: duplicate.data.existingRecordId };
      const parsed = phaseOverlapErrorResponse.safeParse(error.body);
      if (parsed.success) {
        return { kind: 'overlap', message: parsed.data.error, conflictingPhaseIds: parsed.data.conflictingPhaseIds };
      }
    }
    if (error.status === 404) return { kind: 'not-found', message: readableMessage(error) };
    return { kind: 'unknown', message: readableMessage(error) };
  }
  if (error instanceof ApiContractError) {
    return { kind: 'unknown', message: 'The server sent something this version of the app does not understand.' };
  }
  if (error instanceof TypeError) {
    return { kind: 'network', message: 'Could not reach the server. Check your connection and try again.' };
  }
  return { kind: 'unknown', message: 'Something unexpected happened. Try again, and reload the page if it keeps happening.' };
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
