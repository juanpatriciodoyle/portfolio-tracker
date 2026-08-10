"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPasskeyOptions = getPasskeyOptions;
exports.verifyPasskeyCredential = verifyPasskeyCredential;
const server_1 = require("@simplewebauthn/server");
const db_1 = require("./db");
const privacy_1 = require("./privacy");
const RP_NAME = 'Portfolio Tracker';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';
// In-memory challenge store for registration/authentication flows
const challengesStore = new Map();
async function getPasskeyOptions(email) {
    const userHash = (0, privacy_1.hashUserIdentity)(email);
    let user = await db_1.db.user.findUnique({ where: { userHash } });
    if (!user || !user.passkeyCredentialId) {
        // Generate Registration Options
        const options = await (0, server_1.generateRegistrationOptions)({
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
    }
    else {
        // Generate Authentication Options
        const options = await (0, server_1.generateAuthenticationOptions)({
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
async function verifyPasskeyCredential(email, credentialResponse) {
    const userHash = (0, privacy_1.hashUserIdentity)(email);
    const expectedChallenge = challengesStore.get(userHash);
    if (!expectedChallenge) {
        throw new Error('Authentication challenge expired or invalid.');
    }
    let user = await db_1.db.user.findUnique({ where: { userHash } });
    if (!user || !user.passkeyCredentialId) {
        // Verify Registration Response
        const verification = await (0, server_1.verifyRegistrationResponse)({
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
            user = await db_1.db.user.upsert({
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
    }
    else {
        // Verify Authentication Response
        const verification = await (0, server_1.verifyAuthenticationResponse)({
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
            await db_1.db.user.update({
                where: { id: user.id },
                data: { passkeyCounter: verification.authenticationInfo.newCounter },
            });
            challengesStore.delete(userHash);
            return user;
        }
        throw new Error('Passkey authentication verification failed.');
    }
}
