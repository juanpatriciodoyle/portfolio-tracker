import crypto from 'crypto';
import { z } from 'zod';
import type { CipherContext, FieldCipher } from '../application/ports';

/** Thrown for any value that cannot be decrypted. Deliberately says nothing about why. */
export class FieldCipherError extends Error {
  constructor() {
    super('Could not decrypt the stored value');
    this.name = 'FieldCipherError';
  }
}

export class FieldCipherConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldCipherConfigError';
  }
}

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_INFO = Buffer.from('portfolio-tracker/field-cipher/v1');

const MISSING_KEY =
  'PROFILE_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to apps/api/.env';
const INVALID_KEY =
  'PROFILE_ENCRYPTION_KEY must be 32 random bytes encoded as base64 (generate one with `openssl rand -base64 32`)';

const environmentSchema = z.object({
  PROFILE_ENCRYPTION_KEY: z
    .string({ error: MISSING_KEY })
    .min(1, MISSING_KEY)
    .regex(/^[A-Za-z0-9+/]{43}=$/, INVALID_KEY),
});

/** Reads the master key from the environment. There is deliberately no default: a guessable key protects nothing. */
export function loadFieldCipherKey(env: Readonly<Record<string, string | undefined>>): Buffer {
  const parsed = environmentSchema.safeParse(env);
  if (!parsed.success) throw new FieldCipherConfigError(parsed.error.issues[0].message);
  return Buffer.from(parsed.data.PROFILE_ENCRYPTION_KEY, 'base64');
}

/**
 * AES-256-GCM with a per-user key (HKDF-SHA256 of the master key and the user id) and the table,
 * row and user bound in as additional authenticated data.
 * Stored as `v1:<iv>:<tag>:<ciphertext>` (base64url); the version prefix leaves room to rotate keys.
 */
export class AesGcmFieldCipher implements FieldCipher {
  constructor(
    private readonly masterKey: Buffer,
    private readonly randomBytes: (size: number) => Buffer = crypto.randomBytes
  ) {
    if (masterKey.length !== KEY_BYTES) {
      throw new FieldCipherConfigError(`The master key must be exactly ${KEY_BYTES} bytes`);
    }
  }

  encrypt(plaintext: string, context: CipherContext): string {
    const iv = this.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.keyFor(context.userId), iv);
    cipher.setAAD(additionalData(context));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
  }

  decrypt(ciphertext: string, context: CipherContext): string {
    try {
      const [version, iv, tag, encrypted, ...extra] = ciphertext.split(':');
      if (version !== VERSION || encrypted === undefined || extra.length > 0) throw new FieldCipherError();

      const ivBytes = Buffer.from(iv, 'base64url');
      const tagBytes = Buffer.from(tag, 'base64url');
      if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) throw new FieldCipherError();

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.keyFor(context.userId), ivBytes);
      decipher.setAAD(additionalData(context));
      decipher.setAuthTag(tagBytes);
      return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new FieldCipherError();
    }
  }

  private keyFor(userId: string): Buffer {
    return Buffer.from(crypto.hkdfSync('sha256', this.masterKey, Buffer.from(userId, 'utf8'), KEY_INFO, KEY_BYTES));
  }
}

function additionalData(context: CipherContext): Buffer {
  return Buffer.from(`${context.table}\u0000${context.rowId}\u0000${context.userId}`, 'utf8');
}
