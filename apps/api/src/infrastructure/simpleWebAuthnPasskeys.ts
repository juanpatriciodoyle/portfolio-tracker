import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { z } from 'zod';
import { SignInRejectedError } from '../application/errors';
import type { PasskeyAuthenticator, PasskeyCredential, PasskeyStore } from '../application/ports';
import { PasskeyChallenges } from './passkeyChallenges';

const RP_NAME = 'Portfolio Tracker';

/** Where the passkey belongs: the site's domain and the exact address the browser shows. */
export interface PasskeySite {
  readonly rpId: string;
  readonly origin: string;
}

export interface PasskeyAuthenticatorDeps {
  readonly site: PasskeySite;
  readonly store: PasskeyStore;
  readonly now?: () => number;
  /** Names a sign-in question so its answer can find it again. */
  readonly newChallengeId?: () => string;
}

/** The one thing needed from an answer before the library checks the rest of it. */
const answerWithId = z.object({ id: z.string().min(1) });

const refusal = (code: ConstructorParameters<typeof SignInRejectedError>[0]) => new SignInRejectedError(code);

/**
 * Passkeys through SimpleWebAuthn. A passkey is always a discoverable credential tied to an account that was already
 * signed in: signing in asks the browser for any passkey it holds for this site, and the account is found from the
 * credential id. Challenges live five minutes and answer once. Whatever the library says when it refuses stays in
 * the server: the person gets a code.
 */
export function createPasskeyAuthenticator({ site, store, now = Date.now, newChallengeId = () => randomBytes(24).toString('base64url') }: PasskeyAuthenticatorDeps): PasskeyAuthenticator {
  const challenges = new PasskeyChallenges(now);

  return {
    async signInChallenge() {
      const options = await generateAuthenticationOptions({ rpID: site.rpId, userVerification: 'required' });
      const challengeId = newChallengeId();
      challenges.remember(`sign-in:${challengeId}`, options.challenge);
      return { challengeId, options };
    },

    async verifySignIn(challengeId: string, credential: PasskeyCredential) {
      // Taken out at once: a failed attempt cannot be retried against the same challenge.
      const expectedChallenge = challenges.consume(`sign-in:${challengeId}`);
      if (!expectedChallenge) throw refusal('PASSKEY_CHALLENGE_EXPIRED');
      const answer = answerWithId.safeParse(credential);
      if (!answer.success) throw refusal('PASSKEY_REQUEST_INVALID');
      const found = await store.findByCredentialId(answer.data.id);
      if (!found) throw refusal('PASSKEY_UNKNOWN');

      const { account, passkey } = found;
      try {
        const verification = await verifyAuthenticationResponse({
          // The browser's answer is a plain JSON object; the library re-checks its structure and throws when it is not a real one.
          response: credential as unknown as AuthenticationResponseJSON,
          expectedChallenge,
          expectedOrigin: site.origin,
          expectedRPID: site.rpId,
          credential: { id: passkey.credentialId, publicKey: Buffer.from(passkey.publicKey, 'base64url'), counter: passkey.counter },
        });
        if (!verification.verified) throw refusal('PASSKEY_UNVERIFIED');
        await store.updateCounter(account.id, verification.authenticationInfo.newCounter);
        return account;
      } catch (error) {
        throw error instanceof SignInRejectedError ? error : refusal('PASSKEY_UNVERIFIED');
      }
    },

    async registrationOptions(userId: string) {
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: site.rpId,
        // The account id is the passkey's owner. No email is known here, and none is kept.
        userID: new TextEncoder().encode(userId),
        userName: RP_NAME,
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      });
      challenges.remember(`register:${userId}`, options.challenge);
      return options;
    },

    async register(userId: string, credential: PasskeyCredential) {
      const expectedChallenge = challenges.consume(`register:${userId}`);
      if (!expectedChallenge) throw refusal('PASSKEY_CHALLENGE_EXPIRED');

      let verified;
      try {
        verified = await verifyRegistrationResponse({
          response: credential as unknown as RegistrationResponseJSON,
          expectedChallenge,
          expectedOrigin: site.origin,
          expectedRPID: site.rpId,
        });
      } catch {
        throw refusal('PASSKEY_UNVERIFIED');
      }
      if (!verified.verified) throw refusal('PASSKEY_UNVERIFIED');

      const { id, publicKey, counter } = verified.registrationInfo.credential;
      await store.save(userId, { credentialId: id, publicKey: Buffer.from(publicKey).toString('base64url'), counter });
    },
  };
}
