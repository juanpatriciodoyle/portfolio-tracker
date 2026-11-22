import { NEW_USER_DEFAULTS } from '../domain/newUser';
import { GoogleNotConfiguredError, SignInRejectedError } from './errors';
import type {
  AdminDirectory,
  AuthUser,
  IdentityHasher,
  IdentityVerifier,
  PasskeyAuthenticator,
  PasskeyChallenge,
  PasskeyCredential,
  SessionTokenIssuer,
  UserRepository,
  VerifiedGoogleIdentity,
} from './ports';

export interface AuthServiceDeps {
  readonly users: UserRepository;
  readonly googleIdentities: IdentityVerifier;
  readonly passkeys: PasskeyAuthenticator;
  readonly hashIdentity: IdentityHasher;
  readonly issueToken: SessionTokenIssuer;
  readonly admins: AdminDirectory;
  readonly now: () => Date;
}

export interface SignedInUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly country: string;
  /** Only ever true after Google confirmed the administrator's email; the web app uses it to show the Analytics tab. */
  readonly isAdmin: boolean;
}

export interface SignIn {
  readonly token: string;
  readonly user: SignedInUser;
}

const NO_NAME_PLACEHOLDER = 'Privacy User';
const GENERIC_PASSKEY_PREFIXES = new Set(['user', 'passkey']);

/** The name shown for a passkey account, made from the part of the email before the "@". */
export function passkeyDisplayName(email: string): string {
  const prefix = email.split('@')[0];
  if (GENERIC_PASSKEY_PREFIXES.has(prefix.toLowerCase())) return 'Investor';
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

/** Signing in: who the person is, which account that is, and the session that proves it. No personal detail is stored. */
export class AuthService {
  private readonly users: UserRepository;
  private readonly googleIdentities: IdentityVerifier;
  private readonly passkeys: PasskeyAuthenticator;
  private readonly hashIdentity: IdentityHasher;
  private readonly issueToken: SessionTokenIssuer;
  private readonly admins: AdminDirectory;
  private readonly now: () => Date;

  constructor({ users, googleIdentities, passkeys, hashIdentity, issueToken, admins, now }: AuthServiceDeps) {
    this.users = users;
    this.googleIdentities = googleIdentities;
    this.passkeys = passkeys;
    this.hashIdentity = hashIdentity;
    this.issueToken = issueToken;
    this.admins = admins;
    this.now = now;
  }

  /** Only what Google confirms for the token counts: nothing the browser says about who the person is. */
  async signInWithGoogle(accessToken: string): Promise<SignIn> {
    const identity = await this.confirmedIdentity(accessToken);
    const account = await this.accountFor(identity.email);
    const isAdmin = this.admins.isAdmin(this.hashIdentity(identity.email));

    return this.signedIn(account, {
      email: identity.email,
      name: identity.name || NO_NAME_PLACEHOLDER,
      avatarUrl: identity.avatarUrl,
    }, isAdmin);
  }

  async passkeyChallenge(email: string): Promise<PasskeyChallenge> {
    await this.refuseTakeover(email);
    return this.passkeys.challengeFor(email);
  }

  async signInWithPasskey(email: string, credential: PasskeyCredential): Promise<SignIn> {
    await this.refuseTakeover(email);
    const account = await this.passkeys.verify(email, credential);
    return this.signedIn(account, { email, name: passkeyDisplayName(email) });
  }

  private async accountFor(email: string): Promise<AuthUser> {
    const userHash = this.hashIdentity(email);
    return (await this.users.findByIdentityHash(userHash)) ?? (await this.users.create(userHash, NEW_USER_DEFAULTS));
  }

  /**
   * An email is not proof of who is asking, so a passkey may only create an account or open one that already has
   * a passkey. An account made another way (Google) must be opened that way first, and the administrator's identity
   * is never opened with a passkey at all: registering one would only need their email address.
   */
  private async refuseTakeover(email: string): Promise<void> {
    const userHash = this.hashIdentity(email);
    if (this.admins.isAdmin(userHash)) throw new SignInRejectedError('PASSKEY_NOT_FOR_ADMIN');
    const existing = await this.users.findByIdentityHash(userHash);
    if (existing && !existing.hasPasskey) throw new SignInRejectedError('PASSKEY_NEEDS_SIGN_IN');
  }

  private async confirmedIdentity(accessToken: string): Promise<VerifiedGoogleIdentity> {
    try {
      return await this.googleIdentities.verify(accessToken);
    } catch (error) {
      throw new SignInRejectedError(error instanceof GoogleNotConfiguredError ? 'GOOGLE_NOT_CONFIGURED' : 'GOOGLE_TOKEN_UNVERIFIED');
    }
  }

  private async signedIn(account: AuthUser, shown: Pick<SignedInUser, 'email' | 'name' | 'avatarUrl'>, isAdmin = false): Promise<SignIn> {
    await this.users.recordLogin(account.id, this.now());
    return {
      token: this.issueToken(account.id, { admin: isAdmin }),
      user: { id: account.id, ...shown, country: account.country, isAdmin },
    };
  }
}
