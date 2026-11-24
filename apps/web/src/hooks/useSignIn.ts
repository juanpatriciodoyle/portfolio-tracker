import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/apiClient';
import { storeAuthToken } from '../lib/authorizedFetch';
import { clearGuestEndedNotice, peekGuestEndedNotice } from '../lib/guestSession';
import { signInWithPasskey } from '../lib/passkeys';
import { recallUser, rememberUser } from '../lib/rememberedUser';
import { signInFailureMessage } from '../lib/signInFailure';
import { signInResponseSchema, type SignedInUserDto, type SignInResponse } from '../contracts';
import type { MessageKey } from '../i18n/catalogs';
import { useTranslation } from '../i18n/useTranslation';
import { useSubmitOnce } from './useSubmitOnce';

/** After a passkey sign-in the server knows no email: this device puts back the name Google gave the last time. */
function withRememberedDetails(user: SignedInUserDto): SignedInUserDto {
  const remembered = recallUser(user.id);
  return remembered ? { ...user, name: remembered.name, email: remembered.email, avatarUrl: remembered.avatarUrl } : user;
}

/**
 * Every way into the app: Google, a passkey, the demo. Keeps the session the server issues and tells the caller who
 * signed in. One attempt at a time, whichever button was tapped, and a failure is worded for the language on screen.
 */
export function useSignIn(onSuccess: (user: SignedInUserDto) => void) {
  const words = useTranslation();
  const { run, pending } = useSubmitOnce();
  const [error, setError] = useState<string | null>(null);
  // A guest whose hour ended is brought back here: say so, until they try anything, and only once.
  const [guestEnded] = useState(peekGuestEndedNotice);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  useEffect(() => {
    if (guestEnded) clearGuestEndedNotice();
  }, [guestEnded]);
  const notice = guestEnded && !noticeDismissed ? words.t('login.demoEnded') : null;

  const finish = (response: SignInResponse, { remember }: { remember: boolean }) => {
    storeAuthToken(response.token);
    if (remember && response.user.email) rememberUser({ id: response.user.id, name: response.user.name, email: response.user.email, avatarUrl: response.user.avatarUrl });
    onSuccess(response.user);
  };

  const attempt = (action: () => Promise<void>, fallback: MessageKey) =>
    run(async () => {
      setError(null);
      setNoticeDismissed(true);
      try {
        await action();
      } catch (failure) {
        setError(signInFailureMessage(failure, words, fallback));
      }
    });

  return {
    pending,
    error,
    notice,
    setError,
    /** Only Google's token goes to the server, which asks Google who it belongs to. What the browser says is never trusted. */
    withGoogleToken: (accessToken: string, captchaToken?: string) =>
      attempt(async () => {
        const response = await apiRequest('/api/auth/google', signInResponseSchema, { method: 'POST', body: { accessToken, ...(captchaToken ? { captchaToken } : {}) } });
        finish(response, { remember: true });
      }, 'login.googleFailed'),
    withPasskey: () =>
      attempt(async () => {
        const response = await signInWithPasskey();
        finish({ ...response, user: withRememberedDetails(response.user) }, { remember: false });
      }, 'login.passkeyVerify'),
    asGuest: (captchaToken?: string) =>
      attempt(async () => {
        const response = await apiRequest('/api/auth/demo', signInResponseSchema, { method: 'POST', body: captchaToken ? { captchaToken } : {} });
        finish(response, { remember: false });
      }, 'login.demoFailed'),
  };
}
