import type { PrismaClient } from '@prisma/client';
import type { PasskeyStore } from '../application/ports';

/** The one passkey an account has, kept in the account's own row. */
export class PrismaPasskeyStore implements PasskeyStore {
  constructor(private readonly db: PrismaClient) {}

  async findByCredentialId(credentialId: string) {
    const user = await this.db.user.findUnique({ where: { passkeyCredentialId: credentialId } });
    if (!user || user.passkeyCredentialId === null || user.passkeyPublicKey === null) return null;
    return {
      account: { id: user.id, country: user.country, hasPasskey: true, isGuest: user.isGuest },
      passkey: { credentialId: user.passkeyCredentialId, publicKey: user.passkeyPublicKey, counter: user.passkeyCounter },
    };
  }

  async save(userId: string, { credentialId, publicKey, counter }: { credentialId: string; publicKey: string; counter: number }): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { passkeyCredentialId: credentialId, passkeyPublicKey: publicKey, passkeyCounter: counter } });
  }

  async updateCounter(userId: string, counter: number): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { passkeyCounter: counter } });
  }
}
