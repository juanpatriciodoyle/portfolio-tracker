import crypto from 'crypto';
import type { CipherContext } from '../application/ports';
import {
  AesGcmFieldCipher,
  FieldCipherConfigError,
  FieldCipherError,
  loadFieldCipherKey,
} from '../infrastructure/aesGcmFieldCipher';

const masterKey = Buffer.alloc(32, 7);
const context: CipherContext = { table: 'LivingPhase', rowId: 'phase-1', userId: 'user-1' };
const cipher = new AesGcmFieldCipher(masterKey);

const parts = (ciphertext: string) => ciphertext.split(':');
const flipFirstByte = (base64url: string) => {
  const bytes = Buffer.from(base64url, 'base64url');
  bytes[0] ^= 0x01;
  return bytes.toString('base64url');
};

describe('AesGcmFieldCipher round trips', () => {
  it.each([
    ['plain text', 'Calle de Alcalá 123, 4ºB'],
    ['unicode', 'Zoë Ñandú 日本語 🏠'],
    ['an empty string', ''],
    ['JSON', JSON.stringify({ name: 'Madrid', monthlyIncomeMinor: 320000, notes: null })],
    ['a long text', 'x'.repeat(100_000)],
  ])('encrypts and decrypts %s', (_label, plaintext) => {
    expect(cipher.decrypt(cipher.encrypt(plaintext, context), context)).toBe(plaintext);
  });

  it('writes a versioned, four-part value that does not contain the plaintext', () => {
    const plaintext = 'Calle de Alcalá 123';
    const ciphertext = cipher.encrypt(plaintext, context);

    expect(parts(ciphertext)).toHaveLength(4);
    expect(parts(ciphertext)[0]).toBe('v1');
    expect(ciphertext).not.toContain('Alcal');
    expect(Buffer.from(parts(ciphertext)[1], 'base64url')).toHaveLength(12); // 96-bit IV
    expect(Buffer.from(parts(ciphertext)[2], 'base64url')).toHaveLength(16); // 128-bit tag
  });

  it('uses a fresh random IV every time, so equal inputs give different ciphertexts', () => {
    const first = cipher.encrypt('same', context);
    const second = cipher.encrypt('same', context);

    expect(first).not.toBe(second);
    expect(cipher.decrypt(first, context)).toBe('same');
    expect(cipher.decrypt(second, context)).toBe('same');
  });

  it('can be decrypted by plain AES-256-GCM with the documented key derivation (no hidden magic)', () => {
    const ciphertext = cipher.encrypt('interoperable', context);
    const [, iv, tag, encrypted] = parts(ciphertext);
    const userKey = Buffer.from(
      crypto.hkdfSync('sha256', masterKey, Buffer.from(context.userId), Buffer.from('portfolio-tracker/field-cipher/v1'), 32)
    );
    const decipher = crypto.createDecipheriv('aes-256-gcm', userKey, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(`${context.table}\u0000${context.rowId}\u0000${context.userId}`));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    const plain = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]);

    expect(plain.toString('utf8')).toBe('interoperable');
  });
});

describe('AesGcmFieldCipher refuses anything that was tampered with or moved', () => {
  const ciphertext = cipher.encrypt('secret income: 3200', context);

  it('rejects a changed ciphertext, tag or IV', () => {
    for (const index of [1, 2, 3]) {
      const tampered = parts(ciphertext);
      tampered[index] = flipFirstByte(tampered[index]);

      expect(() => cipher.decrypt(tampered.join(':'), context)).toThrow(FieldCipherError);
    }
  });

  it('rejects malformed values', () => {
    expect(() => cipher.decrypt('', context)).toThrow(FieldCipherError);
    expect(() => cipher.decrypt('v1:only:three', context)).toThrow(FieldCipherError);
    expect(() => cipher.decrypt(ciphertext.replace(/^v1/, 'v2'), context)).toThrow(FieldCipherError);
    expect(() => cipher.decrypt('plain text that was never encrypted', context)).toThrow(FieldCipherError);
  });

  it.each([
    ['another user', { ...context, userId: 'user-2' }],
    ['another row', { ...context, rowId: 'phase-2' }],
    ['another table', { ...context, table: 'FixedCostItem' }],
  ])('rejects the ciphertext when it is read as %s', (_label, otherContext) => {
    expect(() => cipher.decrypt(ciphertext, otherContext)).toThrow(FieldCipherError);
  });

  it('rejects a different master key', () => {
    expect(() => new AesGcmFieldCipher(Buffer.alloc(32, 8)).decrypt(ciphertext, context)).toThrow(FieldCipherError);
  });

  it('never puts the plaintext or the key in its error messages', () => {
    const tampered = parts(ciphertext);
    tampered[3] = flipFirstByte(tampered[3]);

    try {
      cipher.decrypt(tampered.join(':'), context);
      throw new Error('should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('3200');
      expect(message).not.toContain(masterKey.toString('base64'));
    }
  });
});

describe('AesGcmFieldCipher keys', () => {
  it.each([0, 16, 31, 33, 64])('refuses a master key of %d bytes', (length) => {
    expect(() => new AesGcmFieldCipher(Buffer.alloc(length, 1))).toThrow(FieldCipherConfigError);
  });

  it('gives each user their own key, so one user cannot read another user’s rows even by id', () => {
    const forUserOne = cipher.encrypt('mine', { ...context, userId: 'user-1' });

    expect(() => cipher.decrypt(forUserOne, { ...context, userId: 'user-2' })).toThrow(FieldCipherError);
  });
});

describe('loadFieldCipherKey', () => {
  const valid = crypto.randomBytes(32).toString('base64');

  it('reads a 32-byte base64 key from the environment', () => {
    expect(loadFieldCipherKey({ PROFILE_ENCRYPTION_KEY: valid }).equals(Buffer.from(valid, 'base64'))).toBe(true);
  });

  it('explains how to fix a missing key without needing a default', () => {
    expect(() => loadFieldCipherKey({})).toThrow(FieldCipherConfigError);
    expect(() => loadFieldCipherKey({})).toThrow(/PROFILE_ENCRYPTION_KEY/);
    expect(() => loadFieldCipherKey({})).toThrow(/openssl rand -base64 32/);
    expect(() => loadFieldCipherKey({ PROFILE_ENCRYPTION_KEY: '' })).toThrow(FieldCipherConfigError);
  });

  it.each([
    ['too short', crypto.randomBytes(16).toString('base64')],
    ['too long', crypto.randomBytes(48).toString('base64')],
    ['not base64', 'this is definitely not a base64 key!!!!!!!!!!!!!!'],
    ['hex instead of base64', crypto.randomBytes(32).toString('hex')],
  ])('rejects a key that is %s', (_label, value) => {
    expect(() => loadFieldCipherKey({ PROFILE_ENCRYPTION_KEY: value })).toThrow(FieldCipherConfigError);
  });

  it('does not echo the rejected value', () => {
    expect(() => loadFieldCipherKey({ PROFILE_ENCRYPTION_KEY: 'abc-secret-value' })).not.toThrow(/abc-secret-value/);
  });
});
