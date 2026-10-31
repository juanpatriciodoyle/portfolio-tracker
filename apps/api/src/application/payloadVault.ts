import type { z } from 'zod';
import type { CipherContext, FieldCipher } from './ports';

/**
 * Seals a JSON payload with the field cipher and opens it again. What comes back out of the vault is
 * parsed with a schema, so data read from storage is checked at the boundary like any other input.
 */
export class PayloadVault {
  constructor(private readonly cipher: FieldCipher) {}

  seal(value: unknown, context: CipherContext): string {
    return this.cipher.encrypt(JSON.stringify(value), context);
  }

  open<Schema extends z.ZodType>(schema: Schema, sealed: string, context: CipherContext): z.output<Schema> {
    return schema.parse(JSON.parse(this.cipher.decrypt(sealed, context)));
  }
}
