import { KNOWN_VENDORS, type KnownVendor } from '../../contracts/vendorDictionary';
import { knownVendorsIn } from '../../contracts/vendorMatching';
import { cleanLines } from './text';

export { KNOWN_VENDORS, type KnownVendor };

/** Where, in lines from the top, the sender normally signs the bill. */
const HEADER_LINES = 12;

/**
 * Who sent the bill, from the dictionary of known senders. A sender named in the header wins over a
 * company mentioned further down (an advert for another operator); two senders competing for the same
 * place answer nothing.
 */
export function identifyVendor(text: string): KnownVendor | null {
  const lines = cleanLines(text);
  const inHeader = knownVendorsIn(lines.slice(0, HEADER_LINES).join('\n'));
  if (inHeader.length > 0) return inHeader.length === 1 ? inHeader[0] : null;

  const anywhere = knownVendorsIn(lines.join('\n'));
  return anywhere.length === 1 ? anywhere[0] : null;
}
