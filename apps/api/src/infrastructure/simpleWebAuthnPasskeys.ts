import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { AuthUser, PasskeyAuthenticator, PasskeyChallenge, PasskeyCredential } from '../application/ports';
import { NEW_USER_DEFAULTS } from '../domain/newUser';
import { db } from '../lib/db';
import { hashUserIdentity } from '../lib/privacy';
import { PasskeyChallenges } from './passkeyChallenges';

const RP_NAME = 'Portfolio Tracker';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

// Challenges wait here for the prompt's answer: five minutes, once.
const challenges = new PasskeyChallenges(Date.now);

async function getPasskeyOptions(email: string): Promise<PasskeyChallenge> {
  const userHash = hashUserIdentity(email);
  let user = await db.user.findUnique({ where: { userHash } });

  if (!user || !user.passkeyCredentialId) {
    // Generate Registration Options
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(userHash.slice(0, 32)),
      userName: 'Privacy User',
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    challenges.remember(userHash, options.challenge);
    return { isRegistration: true, options, userHash };
  } else {
    // Generate Authentication Options
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: [
        {
          id: user.passkeyCredentialId,
        },
      ],
      userVerification: 'preferred',
    });

    challenges.remember(userHash, options.challenge);
    return { isRegistration: false, options, userHash };
  }
}

/**
 * The browser's answer arrives as a plain JSON object; the library re-checks its structure and throws when it is
 * not a real registration or authentication response, so the one cast below only names what it will be checked as.
 */
async function verifyPasskeyCredential(email: string, credentialResponse: PasskeyCredential): Promise<AuthUser> {
  const userHash = hashUserIdentity(email);
  // Taken out at once: a failed attempt cannot be retried against the same challenge.
  const expectedChallenge = challenges.consume(userHash);

  if (!expectedChallenge) {
    throw new Error('Authentication challenge expired or invalid.');
  }

  let user = await db.user.findUnique({ where: { userHash } });

  if (!user || !user.passkeyCredentialId) {
    // Verify Registration Response
    const verification = await verifyRegistrationResponse({
      response: credentialResponse as unknown as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (verification.verified && verification.registrationInfo) {
      const regCred = verification.registrationInfo.credential;
      const credId = regCred.id;
      const credPubKeyBase64 = Buffer.from(regCred.publicKey).toString('base64url');
      const counter = regCred.counter;

      user = await db.user.upsert({
        where: { userHash },
        update: {
          passkeyCredentialId: credId,
          passkeyPublicKey: credPubKeyBase64,
          passkeyCounter: counter,
        },
        create: {
          userHash,
          passkeyCredentialId: credId,
          passkeyPublicKey: credPubKeyBase64,
          passkeyCounter: counter,
          ...NEW_USER_DEFAULTS,
        },
      });

      return { id: user.id, country: user.country, hasPasskey: true };
    }
    throw new Error('Passkey registration verification failed.');
  } else {
    // Verify Authentication Response
    const verification = await verifyAuthenticationResponse({
      response: credentialResponse as unknown as AuthenticationResponseJSON,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: user.passkeyCredentialId,
        publicKey: Buffer.from(user.passkeyPublicKey || '', 'base64url'),
        counter: user.passkeyCounter,
      },
    });

    if (verification.verified && verification.authenticationInfo) {
      await db.user.update({
        where: { id: user.id },
        data: { passkeyCounter: verification.authenticationInfo.newCounter },
      });

      return { id: user.id, country: user.country, hasPasskey: true };
    }
    throw new Error('Passkey authentication verification failed.');
  }
}

/** The passkey adapter the sign-in service uses. */
export const passkeyAuthenticator: PasskeyAuthenticator = {
  challengeFor: getPasskeyOptions,
  verify: verifyPasskeyCredential,
};
