import { z } from 'zod';
import { GoogleNotConfiguredError } from '../application/errors';
import type { IdentityVerifier, VerifiedGoogleIdentity } from '../application/ports';

const PROFILE_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const PROFILE_TIMEOUT_MS = 3000;

/** The part of `fetch` this adapter uses, so tests can answer without a network. */
export type ProfileFetch = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal }
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * What we rely on in Google's token-info answer. The library types `email_verified` as a boolean, but the endpoint
 * sends the text "true" or "false"; both are read, and anything else counts as not verified.
 */
const tokenInfoSchema = z.object({
  aud: z.string(),
  sub: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.union([z.boolean(), z.enum(['true', 'false']).transform((text) => text === 'true')]).optional().catch(false),
});

const profileSchema = z.object({ name: z.string().optional(), picture: z.string().optional() });

/**
 * Asks Google who an access token belongs to. The token must have been issued to THIS application (its audience is
 * our Google client id) and carry an email Google has verified; anything else is refused. Without a configured
 * client id nothing is accepted, because a token for any other application would otherwise pass.
 */
export class GoogleIdentityVerifier implements IdentityVerifier {
  constructor(
    private readonly client: { getTokenInfo(accessToken: string): Promise<unknown> },
    private readonly audience: string | undefined,
    private readonly fetchProfile: ProfileFetch = fetch
  ) {}

  async verify(accessToken: string): Promise<VerifiedGoogleIdentity> {
    if (!this.audience) throw new GoogleNotConfiguredError();

    const info = tokenInfoSchema.parse(await this.client.getTokenInfo(accessToken));
    if (info.aud !== this.audience) throw new Error('The token was issued to another application (audience mismatch).');
    if (info.email_verified !== true) throw new Error('Google has not verified the email of this account.');
    if (!info.email || !info.sub) throw new Error('The token does not identify the person.');

    return { email: info.email, googleId: info.sub, ...(await this.profileOf(accessToken)) };
  }

  /** The name and picture are a courtesy: when they cannot be read, the person still signs in, without them. */
  private async profileOf(accessToken: string): Promise<{ name?: string; avatarUrl?: string }> {
    try {
      const response = await this.fetchProfile(PROFILE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
      });
      if (!response.ok) return { name: undefined, avatarUrl: undefined };
      const profile = profileSchema.safeParse(await response.json());
      return profile.success ? { name: profile.data.name, avatarUrl: profile.data.picture } : { name: undefined, avatarUrl: undefined };
    } catch {
      return { name: undefined, avatarUrl: undefined };
    }
  }
}
