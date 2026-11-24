import { ApiContractError, ApiError } from './apiClient';
import type { MessageKey } from '../i18n/catalogs';
import { HumanCheckIncompleteError } from './humanCheck';
import { serverMessage, type Words } from './serverMessages';

/**
 * What a failed sign-in step says on screen (Google, passkey or demo): the person's own cancelling, the server's refusal in
 * the words of the language on screen, or a plain failure. The words of a library never reach the person.
 */
export function signInFailureMessage(error: unknown, words: Words, fallback: MessageKey): string {
  const { t } = words;
  if (error instanceof HumanCheckIncompleteError) return t('error.captchaFailed');
  if (error instanceof ApiError) return serverMessage(error.body, words, fallback);
  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) return t('login.passkeyCancelled');
  if (error instanceof ApiContractError) return t('error.contract');
  if (error instanceof TypeError) return t('error.network');
  return t(fallback);
}
