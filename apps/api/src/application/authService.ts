import { NEW_USER_DEFAULTS } from '../domain/newUser';
import { GoogleNotConfiguredError, ResourceNotFoundError, SignInRejectedError } from './errors';
import type {
  AdminDirectory,
  AuthUser,
  IdentityHasher,
  IdentityVerifier,
  PasskeyAuthenticator,
  PasskeyCredential,
  PasskeySignInChallenge,
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
  /** False closes sign-up: only people who already have an account (and the administrator) can sign in. */
  readonly allowRegistration: boolean;
  readonly now: () => Date;
}

export interface SignedInUser {
  readonly id: string;
  /** What Google confirmed in this sign-in. A passkey sign-in has none: no email is stored anywhere. */
  readonly email?: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly country: string;
  /** Only ever true after Google confirmed the administrator's email; the web app uses it to show the Analytics tab. */
  readonly isAdmin: boolean;
  readonly hasPasskey: boolean;
  readonly isGuest: boolean;
}

export interface SignIn {
  readonly token: string;
  readonly user: SignedInUser;
}

const NO_NAME_PLACEHOLDER = 'Privacy User';
/** What a passkey sign-in is called until the web app puts back the name it remembers from the last Google sign-in. */
const PASSKEY_USER_NAME = 'Investor';

/**
 * Signing in: who the person is, which account that is, and the session that proves it. No personal detail is stored.
 * An account is created only by Google, which confirms the email. A passkey is added afterwards, to the account that
 * is already signed in, and then signs in on its own.
 */
export class AuthService {
  private readonly users: UserRepository;
  private readonly googleIdentities: IdentityVerifier;
  private readonly passkeys: PasskeyAuthenticator;
  private readonly hashIdentity: IdentityHasher;
  private readonly issueToken: SessionTokenIssuer;
  private readonly admins: AdminDirectory;
  private readonly allowRegistration: boolean;
  private readonly now: () => Date;

  constructor({ users, googleIdentities, passkeys, hashIdentity, issueToken, admins, allowRegistration, now }: AuthServiceDeps) {
    this.users = users;
    this.googleIdentities = googleIdentities;
    this.passkeys = passkeys;
    this.hashIdentity = hashIdentity;
    this.issueToken = issueToken;
    this.admins = admins;
    this.allowRegistration = allowRegistration;
    this.now = now;
  }

  /** Only what Google confirms for the token counts: nothing the browser says about who the person is. */
  async signInWithGoogle(accessToken: string): Promise<SignIn> {
    const identity = await this.confirmedIdentity(accessToken);
    const account = await this.accountFor(identity.email);
    const isAdmin = this.admins.isAdmin(this.hashIdentity(identity.email));

    return this.signedIn(account, { email: identity.email, name: identity.name || NO_NAME_PLACEHOLDER, avatarUrl: identity.avatarUrl }, isAdmin);
  }

  passkeySignInChallenge(): Promise<PasskeySignInChallenge> {
    return this.passkeys.signInChallenge();
  }

  /** The authenticator finds the account from the passkey itself. The administrator never signs in this way. */
  async signInWithPasskey(challengeId: string, credential: PasskeyCredential): Promise<SignIn> {
    const account = await this.passkeys.verifySignIn(challengeId, credential);
    await this.refuseAdministrator(account.id);
    return this.signedIn(account, { name: PASSKEY_USER_NAME });
  }

  /** The question for saving a passkey on the signed-in account, if that account may have one. */
  async passkeyRegistrationOptions(userId: string): Promise<unknown> {
    await this.requireMayAddPasskey(userId);
    return this.passkeys.registrationOptions(userId);
  }

  async addPasskey(userId: string, credential: PasskeyCredential): Promise<void> {
    await this.requireMayAddPasskey(userId);
    await this.passkeys.register(userId, credential);
  }

  private async accountFor(email: string): Promise<AuthUser> {
    const userHash = this.hashIdentity(email);
    const existing = await this.users.findByIdentityHash(userHash);
    if (existing) return existing;
    this.requireOpenRegistration(userHash);
    return this.users.create(userHash, NEW_USER_DEFAULTS);
  }

  /** The administrator's identity is never opened with a passkey, and never holds one: Google confirms who they are, every time. */
  private async refuseAdministrator(userId: string): Promise<void> {
    const userHash = await this.users.identityHashOf(userId);
    if (userHash !== null && this.admins.isAdmin(userHash)) throw new SignInRejectedError('PASSKEY_NOT_FOR_ADMIN');
  }

  private async requireMayAddPasskey(userId: string): Promise<void> {
    const account = await this.users.findById(userId);
    if (!account) throw new ResourceNotFoundError('Account');
    if (account.isGuest) throw new SignInRejectedError('PASSKEY_NOT_FOR_GUEST');
    await this.refuseAdministrator(userId);
    if (account.hasPasskey) throw new SignInRejectedError('PASSKEY_ALREADY_ADDED');
  }

  /** With sign-up closed a new account is refused, except the administrator's own: without it nobody could ever get in. */
  private requireOpenRegistration(userHash: string): void {
    if (!this.allowRegistration && !this.admins.isAdmin(userHash)) throw new SignInRejectedError('REGISTRATION_CLOSED');
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
      user: { id: account.id, ...shown, country: account.country, isAdmin, hasPasskey: account.hasPasskey, isGuest: false },
    };
  }
}
