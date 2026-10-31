import { MAX_AMOUNT_MINOR } from '../../contracts/primitives';
import { markAfter, markBefore } from './currencies';

const GROUP_SPACES = /[ '  ]/g;

/**
 * Reads a printed number in any common locale ("1.234,56", "1,234.56", "1 234,56", "1'234.56") as a
 * plain decimal string. Answers `null` when the text could mean two things ("1.234" is either one
 * thousand two hundred thirty-four or one and a bit) or is malformed: a wrong amount is worse than a blank.
 */
export function parseDecimal(raw: string): string | null {
  if (!/^[0-9][0-9.,'   ]*[0-9]$|^[0-9]$/.test(raw)) return null;
  if (/[ '  ]/.test(raw) && !/^[0-9]{1,3}([ '  ][0-9]{3})+([.,][0-9]+)?$/.test(raw)) return null;
  const s = raw.replace(/[ '\u00A0\u202F]/g, '');

  const separators = s.replace(/[0-9]/g, '');
  if (separators === '') return s;

  const distinct = new Set(separators);
  const grouping = (sep: string) => new RegExp(`^[0-9]{1,3}(?:\\${sep}[0-9]{3})+$`);

  if (distinct.size === 1) {
    const sep = separators[0];
    if (separators.length > 1) return grouping(sep).test(s) ? s.split(sep).join('') : null;

    const [whole, fraction] = s.split(sep);
    if (whole === '' || fraction === '' || fraction.length > 4) return null;
    const couldBeThousands = fraction.length === 3 && whole.length <= 3 && !whole.startsWith('0');
    return couldBeThousands ? null : `${whole}.${fraction}`;
  }

  if (distinct.size !== 2) return null;
  const decimalSep = separators[separators.length - 1];
  const groupSep = decimalSep === ',' ? '.' : ',';
  if (separators.split(decimalSep).length !== 2 || separators.indexOf(decimalSep) !== separators.length - 1) return null;
  const [whole, fraction] = s.split(decimalSep);
  if (!grouping(groupSep).test(whole) || fraction === '' || fraction.length > 4) return null;
  return `${whole.split(groupSep).join('')}.${fraction}`;
}

/** Exact decimal-to-minor-units conversion. `null` rather than rounding, for zero, and for absurd amounts. */
export function toMinorUnits(decimal: string, exponent: number): number | null {
  const [whole, fraction = ''] = decimal.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  if (trimmed.length > exponent) return null;
  const minor = Number(whole + trimmed.padEnd(exponent, '0'));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= MAX_AMOUNT_MINOR ? minor : null;
}

export interface AmountMention {
  readonly decimal: string;
  /** An explicit currency written next to the amount ("€", "GBP", "US$"). */
  readonly currency: string | null;
  /** A bare "$": it could be dollars or pesos, so the caller decides from the living phase. */
  readonly dollarSign: boolean;
}

const NUMBER = /(?<![0-9.,])([0-9]{1,3}(?:(?:[.,'  ]|\s)[0-9]{3})+(?:[.,][0-9]{1,4})?|[0-9]+(?:[.,][0-9]{1,4})?)(?![0-9])/g;
const DATE_LIKE = /[0-9]{1,4}([./-])[0-9]{1,2}\1[0-9]{1,4}/g;
const UNIT_AFTER = /^\s*(?:kwh|kw|m3|m³|gb|mb|mbps|gbps|min|minutos?|kg|l|litros?|%|por ?ciento)(?![a-z])/i;
const MAX_DIGITS = 15;

/** Every amount a line states, in order. Dates, quantities with units, percentages and identifiers are not amounts. */
export function findAmounts(line: string): AmountMention[] {
  const withoutDates = line.replace(DATE_LIKE, (match) => ' '.repeat(match.length));
  const mentions: AmountMention[] = [];

  for (const match of withoutDates.matchAll(NUMBER)) {
    const token = match[1];
    const start = match.index;
    const end = start + token.length;
    if (token.replace(/[^0-9]/g, '').length > MAX_DIGITS) continue;
    if (UNIT_AFTER.test(withoutDates.slice(end, end + 12))) continue;

    const mark = markBefore(withoutDates.slice(Math.max(0, start - 8), start)) ?? markAfter(withoutDates.slice(end, end + 10));
    const currency = mark && 'currency' in mark ? mark.currency : null;
    const dollarSign = mark !== null && 'dollarSign' in mark;
    const hasDecimals = /[.,][0-9]{1,2}$/.test(token);

    let decimal = parseDecimal(token);
    if (decimal === null && mark !== null && /^[0-9]{1,3}[.,][0-9]{3}$/.test(token)) {
      decimal = token.replace(/[.,]/, ''); // a currency never has thousandths: this is thousands
    }
    if (decimal === null || (mark === null && !hasDecimals)) continue;
    mentions.push({ decimal, currency, dollarSign });
  }
  return mentions;
}
