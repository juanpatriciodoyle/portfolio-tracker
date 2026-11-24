import { GoogleNotConfiguredError } from '../application/errors';
import { GoogleIdentityVerifier, type ProfileFetch } from '../infrastructure/googleIdentityVerifier';

const AUDIENCE = 'client-123.apps.googleusercontent.com';

interface Info {
  aud: string;
  email?: string;
  /** Google's token-info endpoint answers this as the text "true" / "false"; the library's type says boolean. */
  email_verified?: boolean | 'true' | 'false';
  sub?: string;
}

const goodInfo: Info = { aud: AUDIENCE, email: 'ana@example.com', email_verified: true, sub: 'g-1' };

interface Setup {
  audience?: string;
  info?: Info | Error;
  profile?: ProfileFetch;
}

function build(setup: Setup = {}) {
  // An explicit `audience: undefined` means "not configured"; only a missing key means the usual one.
  const audience = 'audience' in setup ? setup.audience : AUDIENCE;
  const info = setup.info ?? goodInfo;
  const profile: ProfileFetch =
    setup.profile ?? (async () => ({ ok: true, json: async () => ({ name: 'Ana', picture: 'https://img/a.png' }) }));
  const asked: string[] = [];
  const profileCalls: { url: string; authorization: string | undefined }[] = [];
  const client = {
    getTokenInfo: async (token: string) => {
      asked.push(token);
      if (info instanceof Error) throw info;
      return { scopes: [], expiry_date: 0, ...info };
    },
  };
  const fetchProfile: ProfileFetch = async (url, init) => {
    profileCalls.push({ url, authorization: init.headers.Authorization });
    return profile(url, init);
  };
  return { verifier: new GoogleIdentityVerifier(client, audience, fetchProfile), asked, profileCalls };
}

describe('GoogleIdentityVerifier', () => {
  it('confirms the identity Google reports for the token, with the name and picture of the profile', async () => {
    const { verifier, asked, profileCalls } = build();

    await expect(verifier.verify('access-token')).resolves.toEqual({
      email: 'ana@example.com',
      googleId: 'g-1',
      name: 'Ana',
      avatarUrl: 'https://img/a.png',
    });
    expect(asked).toEqual(['access-token']);
    expect(profileCalls).toEqual([{ url: 'https://www.googleapis.com/oauth2/v3/userinfo', authorization: 'Bearer access-token' }]);
  });

  it.each([undefined, ''])('is not configured without an audience (%j): it refuses and never asks Google', async (audience) => {
    const { verifier, asked } = build({ audience });

    await expect(verifier.verify('access-token')).rejects.toBeInstanceOf(GoogleNotConfiguredError);
    expect(asked).toEqual([]);
  });

  it('refuses a token that was issued to another application, and reads no profile with it', async () => {
    const { verifier, profileCalls } = build({ info: { ...goodInfo, aud: 'someone-elses-client' } });

    await expect(verifier.verify('access-token')).rejects.toThrow(/audience/i);
    expect(profileCalls).toEqual([]);
  });

  it('refuses an email Google has not verified', async () => {
    for (const email_verified of [false, undefined]) {
      const { verifier } = build({ info: { ...goodInfo, email_verified } });
      await expect(verifier.verify('access-token')).rejects.toThrow(/verified/i);
    }
  });

  it("accepts Google's real answer, where email_verified arrives as the text 'true'", async () => {
    const { verifier } = build({ info: { ...goodInfo, email_verified: 'true' } });

    await expect(verifier.verify('access-token')).resolves.toMatchObject({ email: 'ana@example.com', googleId: 'g-1' });
  });

  it("refuses an email_verified that arrives as the text 'false'", async () => {
    const { verifier } = build({ info: { ...goodInfo, email_verified: 'false' } });

    await expect(verifier.verify('access-token')).rejects.toThrow(/verified/i);
  });

  it('refuses a token that carries no email or no stable Google id', async () => {
    await expect(build({ info: { ...goodInfo, email: undefined } }).verifier.verify('t')).rejects.toThrow();
    await expect(build({ info: { ...goodInfo, sub: undefined } }).verifier.verify('t')).rejects.toThrow();
  });

  it('refuses a token Google itself rejects', async () => {
    const { verifier } = build({ info: new Error('invalid_token') });
    await expect(verifier.verify('expired')).rejects.toThrow('invalid_token');
  });

  describe('when the profile cannot be read', () => {
    const identityOnly = { email: 'ana@example.com', googleId: 'g-1', name: undefined, avatarUrl: undefined };

    it('still signs in, without name or picture, when the request fails', async () => {
      const { verifier } = build({
        profile: async () => {
          throw new Error('offline');
        },
      });
      await expect(verifier.verify('t')).resolves.toEqual(identityOnly);
    });

    it('still signs in when Google answers with an error status', async () => {
      const { verifier } = build({ profile: async () => ({ ok: false, json: async () => ({}) }) });
      await expect(verifier.verify('t')).resolves.toEqual(identityOnly);
    });

    it('still signs in when the answer is not a profile', async () => {
      const { verifier } = build({ profile: async () => ({ ok: true, json: async () => ({ name: 42, picture: ['x'] }) }) });
      await expect(verifier.verify('t')).resolves.toEqual(identityOnly);
    });
  });
});
