import { describe, expect, it } from 'vitest';
import { translatorFor } from '../../i18n/translate';
import { ApiError } from '../apiClient';
import { signInFailureMessage } from '../signInFailure';

const english = { t: translatorFor('en'), locale: 'en' as const };
const spanish = { t: translatorFor('es-AR'), locale: 'es-AR' as const };

describe('signInFailureMessage', () => {
  it('says the prompt was cancelled when the person (or the device) cancelled it', () => {
    const cancelled = Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' });

    expect(signInFailureMessage(cancelled, english, 'login.passkeyVerify')).toBe(english.t('login.passkeyCancelled'));
    expect(signInFailureMessage(cancelled, spanish, 'login.passkeyVerify')).toBe(spanish.t('login.passkeyCancelled'));
  });

  it('shows the server’s refusal in the language on screen, by its code', () => {
    const refusal = new ApiError(401, 'No account has this passkey.', { error: 'No account has this passkey. (server wording)', code: 'PASSKEY_UNKNOWN' });

    expect(signInFailureMessage(refusal, english, 'login.passkeyVerify')).toBe('No account has this passkey. (server wording)');
    expect(signInFailureMessage(refusal, spanish, 'login.passkeyVerify')).toBe(spanish.t('error.passkeyUnknown'));
  });

  it('falls back to the generic message for a refusal it does not know, in another language', () => {
    const odd = new ApiError(500, 'Boom', { error: 'Boom' });
    expect(signInFailureMessage(odd, spanish, 'login.passkeyVerify')).toBe(spanish.t('login.passkeyVerify'));
  });

  it('says the server cannot be reached when the request itself failed', () => {
    expect(signInFailureMessage(new TypeError('Failed to fetch'), english, 'login.passkeyVerify')).toBe(english.t('error.network'));
  });

  it('never shows the words of the library: anything else is the plain fallback', () => {
    expect(signInFailureMessage(new Error('Unexpected registration response origin'), english, 'login.passkeyError')).toBe(english.t('login.passkeyError'));
  });
});
