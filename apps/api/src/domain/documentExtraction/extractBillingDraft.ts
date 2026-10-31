import type { BillingDraft } from '../../contracts/document';
import { findAmounts, toMinorUnits, type AmountMention } from './amounts';
import { inferCadence } from './cadence';
import { inferCategory } from './category';
import { currencyExponent, DOLLAR_SIGN_CURRENCIES, KNOWN_CURRENCIES } from './currencies';
import { findBillingPeriod, type DateOrder } from './dates';
import { cleanLines, fold, hasReadableText } from './text';
import { identifyVendor } from './vendors';

export interface ExtractionHints {
  /** Country of the living phase the bill probably belongs to: decides how "03/04/2026" reads. */
  readonly countryCode?: string | null;
  /** Currency of that phase: it resolves a bare "$" and nothing else. */
  readonly currency?: string | null;
}

export interface ExtractionResult {
  /** False when the PDF has no text layer (a scan): the draft is empty and nothing was guessed. */
  readonly textFound: boolean;
  readonly draft: BillingDraft;
}

export const EMPTY_DRAFT: BillingDraft = {
  amountMinor: null,
  currency: null,
  vendor: null,
  category: null,
  cadence: null,
  periodStart: null,
  periodEnd: null,
};

const MONTH_FIRST_COUNTRIES: ReadonlySet<string> = new Set(['US', 'PH']);

export function dateOrderFor(countryCode: string | null | undefined): DateOrder {
  if (!countryCode) return null;
  return MONTH_FIRST_COUNTRIES.has(countryCode) ? 'MDY' : 'DMY';
}

const STRONG_TOTAL =
  /total a pagar|importe total|total factura|total de la factura|total a abonar|total to pay|total due|amount due|balance due|total amount|amount to pay|importe a pagar|saldo a pagar|total general|total ttc|montant total|montant a payer|gesamtbetrag|zu zahlen|totale da pagare|importe de la factura/;
const PLAIN_TOTAL = /\btotal\b/;
const NOT_A_TOTAL = /subtotal|sub-total|base imponible|\biva\b|\bvat\b|impuesto|\btax\b|\bigv\b|descuento|discount|consumo|energia|potencia|total (?:de )?(?:consumo|energia|potencia)/;

/** The text after the label, and the line below it for labels that sit alone ("Importe total" / "96,50 €"). */
function amountsAfterLabel(lines: readonly string[], index: number, label: RegExp): AmountMention[] {
  const folded = fold(lines[index]);
  const match = label.exec(folded);
  const rest = match ? lines[index].slice(match.index + match[0].length) : lines[index];
  const onLine = findAmounts(rest);
  return onLine.length > 0 || !lines[index + 1] ? onLine : findAmounts(lines[index + 1]);
}

/**
 * The amount the bill asks for. Strongly labelled totals ("Total a pagar") are tried first, then a plain
 * "Total" on a line that is not a subtotal, tax or consumption line. If the chosen tier names two
 * different amounts nothing is returned: a blank is better than the wrong number.
 */
function pickTotal(lines: readonly string[]): AmountMention | null {
  const tiers: Array<{ applies: (folded: string) => boolean; label: RegExp }> = [
    { applies: (folded) => STRONG_TOTAL.test(folded), label: STRONG_TOTAL },
    { applies: (folded) => PLAIN_TOTAL.test(folded) && !NOT_A_TOTAL.test(folded), label: PLAIN_TOTAL },
  ];

  for (const { applies, label } of tiers) {
    const mentions = lines.flatMap((line, index) => (applies(fold(line)) ? amountsAfterLabel(lines, index, label).slice(0, 1) : []));
    if (mentions.length === 0) continue;
    return new Set(mentions.map((mention) => mention.decimal.replace(/\.?0+$/, '').replace(/^$/, '0'))).size === 1 ? mentions[0] : null;
  }
  return null;
}

function currencyFor(total: AmountMention, lines: readonly string[], hints: ExtractionHints): string | null {
  if (total.currency) return total.currency;
  if (total.dollarSign) return hints.currency && DOLLAR_SIGN_CURRENCIES.has(hints.currency) ? hints.currency : null;

  const written = new Set(lines.flatMap((line) => findAmounts(line).flatMap((mention) => (mention.currency ? [mention.currency] : []))));
  return written.size === 1 ? [...written][0] : null;
}

/**
 * Reads what can be read from the text of a bill. Pure: the same text and hints always give the same
 * draft. Every field the text does not state clearly stays `null`; nothing is guessed.
 */
export function extractBillingDraft(text: string, hints: ExtractionHints = {}): ExtractionResult {
  const lines = cleanLines(text);
  if (!hasReadableText(lines)) return { textFound: false, draft: EMPTY_DRAFT };

  const period = findBillingPeriod(text, dateOrderFor(hints.countryCode));
  const vendor = identifyVendor(text);
  const total = pickTotal(lines);
  const currency = total ? currencyFor(total, lines, hints) : null;

  const exponentCurrency = [currency, hints.currency].find((code): code is string => !!code && KNOWN_CURRENCIES.has(code));
  const amountMinor = total ? toMinorUnits(total.decimal, exponentCurrency ? currencyExponent(exponentCurrency) : 2) : null;

  return {
    textFound: true,
    draft: {
      amountMinor,
      currency: amountMinor === null ? null : currency,
      vendor: vendor?.name ?? null,
      category: inferCategory(text, vendor?.categories),
      cadence: inferCadence({ periodStart: period?.start ?? null, periodEnd: period?.end ?? null, text }),
      periodStart: period?.start ?? null,
      periodEnd: period?.end ?? null,
    },
  };
}
