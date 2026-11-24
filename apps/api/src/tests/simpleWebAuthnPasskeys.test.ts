import * as server from '@simplewebauthn/server';
import type { AuthUser, PasskeyStore, StoredPasskey } from '../application/ports';
import { createPasskeyAuthenticator } from '../infrastructure/simpleWebAuthnPasskeys';
import { PASSKEY_CHALLENGE_TTL_MS } from '../infrastructure/passkeyChallenges';

// Only the cryptographic checks are replaced: the options and everything around them are the real library's.
jest.mock('@simplewebauthn/server', () => ({
  ...jest.requireActual('@simplewebauthn/server'),
  verifyAuthenticationResponse: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
}));
const verifyAuthentication = server.verifyAuthenticationResponse as jest.Mock;
const verifyRegistration = server.verifyRegistrationResponse as jest.Mock;

const SITE = { rpId: 'portfolio.example.test', origin: 'https://portfolio.example.test' };
const ANA: AuthUser = { id: 'user-ana', country: 'Spain', hasPasskey: true, isGuest: false };
const STORED: StoredPasskey = { credentialId: 'cred-ana', publicKey: Buffer.from([1, 2, 3]).toString('base64url'), counter: 4 };

function build() {
  let now = 1_000_000;
  let nextId = 0;
  const saved: { userId: string; passkey: StoredPasskey }[] = [];
  const counters: { userId: string; counter: number }[] = [];
  const store: PasskeyStore = {
    findByCredentialId: async (credentialId) => (credentialId === STORED.credentialId ? { account: ANA, passkey: STORED } : null),
    save: async (userId, passkey) => void saved.push({ userId, passkey }),
    updateCounter: async (userId, counter) => void counters.push({ userId, counter }),
  };
  const authenticator = createPasskeyAuthenticator({ site: SITE, store, now: () => now, newChallengeId: () => `challenge-${++nextId}` });
  return { authenticator, saved, counters, advance: (ms: number) => void (now += ms) };
}

const credentialOf = (id: string) => ({ id, rawId: id, type: 'public-key', response: {} });

describe('passkey sign-in, with no email', () => {
  it('asks for any passkey saved on this device: nobody is named in the question', async () => {
    const { authenticator } = build();

    const { challengeId, options } = await authenticator.signInChallenge();

    expect(challengeId).toBe('challenge-1');
    const asked = options as { rpId: string; challenge: string; allowCredentials?: unknown; userVerification: string };
    expect(asked.rpId).toBe('portfolio.example.test');
    expect(asked.allowCredentials).toBeUndefined();
    expect(asked.userVerification).toBe('required');
    expect(asked.challenge.length).toBeGreaterThan(10);
  });

  it('finds the account from the passkey, checks the answer against this site, and moves the counter on', async () => {
    const { authenticator, counters } = build();
    const { challengeId, options } = await authenticator.signInChallenge();
    verifyAuthentication.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 5 } });

    await expect(authenticator.verifySignIn(challengeId, credentialOf('cred-ana'))).resolves.toBe(ANA);

    const call = verifyAuthentication.mock.calls[0][0];
    expect(call.expectedChallenge).toBe((options as { challenge: string }).challenge);
    expect(call.expectedOrigin).toBe(SITE.origin);
    expect(call.expectedRPID).toBe(SITE.rpId);
    expect(call.credential).toEqual({ id: 'cred-ana', publicKey: Buffer.from([1, 2, 3]), counter: 4 });
    expect(counters).toEqual([{ userId: 'user-ana', counter: 5 }]);
  });

  it('answers a challenge once: replaying the same answer finds nothing to check it against', async () => {
    const { authenticator } = build();
    const { challengeId } = await authenticator.signInChallenge();
    verifyAuthentication.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 5 } });

    await authenticator.verifySignIn(challengeId, credentialOf('cred-ana'));

    await expect(authenticator.verifySignIn(challengeId, credentialOf('cred-ana'))).rejects.toMatchObject({ code: 'PASSKEY_CHALLENGE_EXPIRED' });
  });

  it('lets a challenge live five minutes', async () => {
    const { authenticator, advance } = build();
    const { challengeId } = await authenticator.signInChallenge();
    advance(PASSKEY_CHALLENGE_TTL_MS + 1);

    await expect(authenticator.verifySignIn(challengeId, credentialOf('cred-ana'))).rejects.toMatchObject({ code: 'PASSKEY_CHALLENGE_EXPIRED' });
    expect(verifyAuthentication).not.toHaveBeenCalled();
  });

  it('refuses an id that was never handed out', async () => {
    const { authenticator } = build();
    await expect(authenticator.verifySignIn('made-up', credentialOf('cred-ana'))).rejects.toMatchObject({ code: 'PASSKEY_CHALLENGE_EXPIRED' });
  });

  it('refuses a passkey no account has, and spends the challenge', async () => {
    const { authenticator } = build();
    const { challengeId } = await authenticator.signInChallenge();

    await expect(authenticator.verifySignIn(challengeId, credentialOf('someone-else'))).rejects.toMatchObject({ code: 'PASSKEY_UNKNOWN' });
    await expect(authenticator.verifySignIn(challengeId, credentialOf('cred-ana'))).rejects.toMatchObject({ code: 'PASSKEY_CHALLENGE_EXPIRED' });
    expect(verifyAuthentication).not.toHaveBeenCalled();
  });

  it('refuses an answer with no passkey id', async () => {
    const { authenticator } = build();
    const { challengeId } = await authenticator.signInChallenge();

    await expect(authenticator.verifySignIn(challengeId, { response: {} })).rejects.toMatchObject({ code: 'PASSKEY_REQUEST_INVALID' });
  });

  it.each([
    ['says it did not verify', async () => ({ verified: false })],
    ['throws', async () => Promise.reject(new Error('Unexpected authentication response origin "https://evil.test"'))],
  ])('refuses, with a code and not the library’s words, when the check %s', async (_name, outcome) => {
    const { authenticator, counters } = build();
    const { challengeId } = await authenticator.signInChallenge();
    verifyAuthentication.mockImplementation(outcome);

    const attempt = authenticator.verifySignIn(challengeId, credentialOf('cred-ana'));

    await expect(attempt).rejects.toMatchObject({ code: 'PASSKEY_UNVERIFIED', message: expect.not.stringContaining('evil') });
    expect(counters).toEqual([]);
  });
});

describe('saving a passkey on the account that is signed in', () => {
  it('asks for a passkey that can sign in by itself, tied to the account id and not to any email', async () => {
    const { authenticator } = build();

    const options = (await authenticator.registrationOptions('user-ana')) as {
      rp: { id: string };
      user: { id: string; name: string };
      authenticatorSelection: { residentKey: string; userVerification: string };
    };

    expect(options.rp.id).toBe(SITE.rpId);
    expect(Buffer.from(options.user.id, 'base64url').toString()).toBe('user-ana');
    expect(options.user.name).toBe('Portfolio Tracker');
    expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
  });

  it('saves the verified passkey for that account, as base64url', async () => {
    const { authenticator, saved } = build();
    await authenticator.registrationOptions('user-ana');
    verifyRegistration.mockResolvedValue({
      verified: true,
      registrationInfo: { credential: { id: 'new-cred', publicKey: new Uint8Array([9, 8, 7]), counter: 0 } },
    });

    await authenticator.register('user-ana', credentialOf('new-cred'));

    expect(saved).toEqual([{ userId: 'user-ana', passkey: { credentialId: 'new-cred', publicKey: Buffer.from([9, 8, 7]).toString('base64url'), counter: 0 } }]);
    expect(verifyRegistration.mock.calls[0][0]).toMatchObject({ expectedOrigin: SITE.origin, expectedRPID: SITE.rpId });
  });

  it('needs a challenge asked for by the same account, and uses it once', async () => {
    const { authenticator, saved } = build();
    await authenticator.registrationOptions('user-ana');
    verifyRegistration.mockResolvedValue({ verified: true, registrationInfo: { credential: { id: 'c', publicKey: new Uint8Array([1]), counter: 0 } } });

    await expect(authenticator.register('user-bob', credentialOf('c'))).rejects.toMatchObject({ code: 'PASSKEY_CHALLENGE_EXPIRED' });
    await authenticator.register('user-ana', credentialOf('c'));
    await expect(authenticator.register('user-ana', credentialOf('c'))).rejects.toMatchObject({ code: 'PASSKEY_CHALLENGE_EXPIRED' });
    expect(saved).toHaveLength(1);
  });

  it('saves nothing, and says only that it could not be verified, when the check fails', async () => {
    const { authenticator, saved } = build();
    await authenticator.registrationOptions('user-ana');
    verifyRegistration.mockRejectedValue(new Error('Unexpected registration response origin'));

    await expect(authenticator.register('user-ana', credentialOf('c'))).rejects.toMatchObject({ code: 'PASSKEY_UNVERIFIED' });
    expect(saved).toEqual([]);
  });
});
