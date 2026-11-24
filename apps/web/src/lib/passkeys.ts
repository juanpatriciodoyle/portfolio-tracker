import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { passkeyRegistrationOptionsResponse, passkeySignInOptionsResponse, signInResponseSchema, type SignInResponse } from '../contracts';
import { apiCommand, apiRequest } from './apiClient';

export { browserSupportsWebAuthn };

/** Signs in with a passkey the browser holds for this site. Nobody types anything: the server finds the account from the passkey. */
export async function signInWithPasskey(): Promise<SignInResponse> {
  const { challengeId, options } = await apiRequest('/api/auth/passkey/sign-in/options', passkeySignInOptionsResponse, { method: 'POST', body: {} });
  // The server's options are checked against their contract above; the passkey library re-checks them in full.
  const credential = await startAuthentication({ optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON });
  return apiRequest('/api/auth/passkey/sign-in/verify', signInResponseSchema, { method: 'POST', body: { challengeId, credential } });
}

/**
 * Saves a passkey on the account that is signed in. `label` is what the browser's passkey list shows: it is put in the
 * options here, in the browser, so the server never learns an email.
 */
export async function addPasskey(label: string): Promise<void> {
  const { options } = await apiRequest('/api/auth/passkey/register/options', passkeyRegistrationOptionsResponse, { method: 'POST', body: {} });
  const creation = options as unknown as PublicKeyCredentialCreationOptionsJSON;
  const credential = await startRegistration({ optionsJSON: { ...creation, user: { ...creation.user, name: label, displayName: label } } });
  await apiCommand('/api/auth/passkey/register/verify', { method: 'POST', body: { credential } });
}

/** Whether to offer "add a passkey": not to a demo guest, not to the administrator (Google only), and only where the browser can. */
export function mayAddPasskey(user: { isGuest?: boolean; isAdmin?: boolean }): boolean {
  return user.isGuest !== true && user.isAdmin !== true && browserSupportsWebAuthn();
}
