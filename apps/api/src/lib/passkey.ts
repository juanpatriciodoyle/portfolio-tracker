import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db } from './db';
import { hashUserIdentity } from './privacy';

const RP_NAME = 'Portfolio Tracker';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

// In-memory challenge store for registration/authentication flows
const challengesStore = new Map<string, string>();

export async function getPasskeyOptions(email: string) {
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

    challengesStore.set(userHash, options.challenge);
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

    challengesStore.set(userHash, options.challenge);
    return { isRegistration: false, options, userHash };
  }
}

export async function verifyPasskeyCredential(email: string, credentialResponse: any) {
  const userHash = hashUserIdentity(email);
  const expectedChallenge = challengesStore.get(userHash);

  if (!expectedChallenge) {
    throw new Error('Authentication challenge expired or invalid.');
  }

  let user = await db.user.findUnique({ where: { userHash } });

  if (!user || !user.passkeyCredentialId) {
    // Verify Registration Response
    const verification = await verifyRegistrationResponse({
      response: credentialResponse,
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
          country: 'Spain',
          baseCurrency: 'EUR',
          annualInflationRate: 2.8,
        },
      });

      challengesStore.delete(userHash);
      return user;
    }
    throw new Error('Passkey registration verification failed.');
  } else {
    // Verify Authentication Response
    const verification = await verifyAuthenticationResponse({
      response: credentialResponse,
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

      challengesStore.delete(userHash);
      return user;
    }
    throw new Error('Passkey authentication verification failed.');
  }
}
