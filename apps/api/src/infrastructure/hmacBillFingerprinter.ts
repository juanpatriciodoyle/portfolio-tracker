import crypto from 'crypto';
import type { BillFingerprinter } from '../application/ports';

const KEY_BYTES = 32;
const KEY_INFO = Buffer.from('portfolio-tracker/bill-fingerprint/v1');

/**
 * Keyed fingerprints (HMAC-SHA256) so duplicates can be found without storing anything readable. The key is
 * derived from the master key but is a different key from the one that encrypts data, and each person's
 * fingerprints differ, so they cannot be compared across accounts or guessed from the low-entropy bill fields.
 */
export class HmacBillFingerprinter implements BillFingerprinter {
  private readonly key: Buffer;

  constructor(masterKey: Buffer) {
    if (masterKey.length !== KEY_BYTES) throw new Error(`The master key must be exactly ${KEY_BYTES} bytes`);
    this.key = Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), KEY_INFO, KEY_BYTES));
  }

  fingerprint(userId: string, identity: string): string {
    return crypto.createHmac('sha256', this.key).update(`${userId}\u0000${identity}`).digest('hex');
  }
}
