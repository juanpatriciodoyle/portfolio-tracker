import {
  DOCUMENT_ERROR_CODES,
  ENCRYPTION_NOT_CONFIGURED,
  duplicateBillingRecordErrorResponse,
  phaseOverlapErrorResponse,
  validationErrorResponse,
  type DocumentErrorCode,
} from '../contracts';
import { ApiContractError, ApiError } from './apiClient';
import { currentWords, knownServerMessage, serverMessage, writtenByServer, type Words } from './serverMessages';

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
function readableMessage(error: ApiError, words: Words): string {
  const { t, locale } = words;
  const written = writtenByServer(error.body);
  if (written !== '' && !RAW_SERVER_TEXT.test(written)) {
    // English keeps the sentence the server wrote; another language uses its own words when it knows the answer.
    const message = locale === 'en' ? written : knownServerMessage(error.body, t);
    if (message) return message;
  }
  if (error.status >= 500) return t('error.server');
  if (error.status === 400) return t('error.invalidRequest');
  if (error.status === 404) return t('error.notFound');
  if (error.status === 429) return t('error.tooManyAttempts');
  return t('error.notCompleted');
}

/** The words default to the language chosen on screen: an error is worded when it happens, at the API boundary. */
export function classifyApiError(error: unknown, words: Words = currentWords()): ApiFailure {
  const { t } = words;
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return { kind: 'signed-out', message: t('error.signedOut') };
    }
    if (error.status === 503 && (error.body as { code?: unknown } | null)?.code === ENCRYPTION_NOT_CONFIGURED) {
      return { kind: 'encryption-unavailable', message: readableMessage(error, words) };
    }
    if (error.status === 400) {
      const parsed = validationErrorResponse.safeParse(error.body);
      if (parsed.success) return { kind: 'validation', message: serverMessage(parsed.data, words, 'error.invalidRequest'), issues: parsed.data.issues };
    }
    const code = (error.body as { code?: unknown } | null)?.code;
    const documentCode = DOCUMENT_ERROR_CODES.find((known) => known === code);
    if (documentCode) return { kind: 'document', code: documentCode, message: readableMessage(error, words) };
    if (error.status === 409) {
      const duplicate = duplicateBillingRecordErrorResponse.safeParse(error.body);
      if (duplicate.success) return { kind: 'duplicate', message: serverMessage(duplicate.data, words, 'error.duplicateBill'), existingRecordId: duplicate.data.existingRecordId };
      const parsed = phaseOverlapErrorResponse.safeParse(error.body);
      if (parsed.success) {
        return { kind: 'overlap', message: serverMessage(parsed.data, words, 'error.phaseOverlap'), conflictingPhaseIds: parsed.data.conflictingPhaseIds };
      }
    }
    if (error.status === 404) return { kind: 'not-found', message: readableMessage(error, words) };
    return { kind: 'unknown', message: readableMessage(error, words) };
  }
  if (error instanceof ApiContractError) {
    return { kind: 'unknown', message: t('error.contract') };
  }
  if (error instanceof TypeError) {
    return { kind: 'network', message: t('error.network') };
  }
  return { kind: 'unknown', message: t('error.unexpected') };
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
