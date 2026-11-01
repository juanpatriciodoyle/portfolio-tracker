/**
 * What a field lets through while it is typed in. Each helper takes the raw text and returns the part the
 * field accepts, so a stray letter in an amount, or a digit in a city, never lands in the input.
 */

/** An amount: digits and one decimal mark ("." or ","). A thousands comma the person typed is kept. */
export function keepDecimal(value: string): string {
  let seenMark = false;
  let kept = '';
  for (const character of value) {
    if (/\d/.test(character)) kept += character;
    else if ((character === '.' || character === ',') && !seenMark) {
      seenMark = true;
      kept += character;
    }
  }
  return kept;
}

/** Only digits, up to `max` of them when a limit is given (a year takes four). */
export function keepDigits(value: string, max?: number): string {
  const digits = value.replace(/\D/g, '');
  return max === undefined ? digits : digits.slice(0, max);
}

/** Letters of any alphabet, spaces and the marks names use (apostrophe, hyphen, full stop). No digits, no symbols. */
export function keepNameCharacters(value: string): string {
  return value.replace(/[^\p{L}\p{M}\s'’.-]/gu, '');
}

/** A 'YYYY-MM-DD' day typed into a date field, with its year cut to four digits ("12345-01-01" becomes "1234-01-01"). */
export function clampDateYear(value: string): string {
  const match = /^(\d{5,})(-\d{2}-\d{2})$/.exec(value);
  return match ? `${match[1].slice(0, 4)}${match[2]}` : value;
}
