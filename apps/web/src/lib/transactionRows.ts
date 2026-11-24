import type { Translate } from '../i18n/translate';
import { currencyExponent, formatCalendarDate, formatMinor } from './money';
import { formatUnits } from './saleRules';

/** A transaction as the history lists it: all that is needed to correct it or to say what removing it does. */
export interface EditableTransaction {
  id: string;
  type: 'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL';
  symbol: string;
  name?: string | null;
  quantity?: number;
  amount: number;
  fee: number;
  currency: string;
  /** ISO timestamp. */
  date: string;
  paidWithCash?: boolean;
}

/** What the person typed in the correction form. */
export interface CorrectionFields {
  quantity: string;
  amount: string;
  fee: string;
  /** `YYYY-MM-DD`. */
  date: string;
  paidWithCash: boolean;
}

/** The fields of `PATCH /api/transactions/:id`: only those that changed are present. */
export interface TransactionCorrection {
  date?: string;
  quantity?: number;
  amount?: number;
  fee?: number;
  paidWithCash?: boolean;
}

const SAME = 1e-9;
const same = (a: number, b: number) => Math.abs(a - b) < SAME;
const numberOf = (text: string) => (text.trim() === '' ? Number.NaN : Number(text));
const isTrade = (type: EditableTransaction['type']) => type === 'BOUGHT' || type === 'SOLD';

/** The cash held in one currency: what a purchase can be paid with. Never below zero; nothing when the balances are not known yet. */
export function cashHeldIn(balances: readonly { currency: string; balance: number }[] | undefined, currency: string): number {
  const held = balances?.find((line) => line.currency.toUpperCase() === currency.toUpperCase())?.balance ?? 0;
  return Math.max(0, held);
}

/** What the person changed, and only that. Fields that mean nothing for this kind of transaction (units of a deposit) are never sent. */
export function correctionOf(original: EditableTransaction, fields: CorrectionFields): TransactionCorrection {
  const correction: TransactionCorrection = {};

  const quantity = numberOf(fields.quantity);
  if (isTrade(original.type) && Number.isFinite(quantity) && quantity > 0 && !same(quantity, original.quantity ?? 1)) correction.quantity = quantity;

  const amount = numberOf(fields.amount);
  if (Number.isFinite(amount) && amount > 0 && !same(amount, original.amount)) correction.amount = amount;

  const fee = fields.fee.trim() === '' ? 0 : numberOf(fields.fee);
  if (Number.isFinite(fee) && fee >= 0 && !same(fee, original.fee)) correction.fee = fee;

  const day = new Date(fields.date);
  if (fields.date !== '' && !Number.isNaN(day.getTime()) && fields.date !== original.date.slice(0, 10)) correction.date = day.toISOString();

  if (original.type === 'BOUGHT' && fields.paidWithCash !== Boolean(original.paidWithCash)) correction.paidWithCash = fields.paidWithCash;

  return correction;
}

const KIND_KEY = { BOUGHT: 'tx.type.bought', SOLD: 'tx.type.sold', DEPOSIT: 'tx.type.deposit', WITHDRAWAL: 'tx.type.withdraw' } as const;

const dayOf = (tx: EditableTransaction, locale: string) => formatCalendarDate(tx.date.slice(0, 10), locale);

/** "Buy AAPL, Mar 3, 2026": what a row is, in a few words. It is also the accessible name of the row's buttons. */
export function describeRow(tx: EditableTransaction, t: Translate, locale: string): string {
  const kind = t(KIND_KEY[tx.type]);
  return isTrade(tx.type) ? `${kind} ${tx.symbol}, ${dayOf(tx, locale)}` : `${kind}, ${dayOf(tx, locale)}`;
}

/** What removing this transaction takes away and what is recalculated afterwards, in plain words. */
export function deleteConsequence(tx: EditableTransaction, t: Translate, locale: string): string {
  const date = dayOf(tx, locale);
  const name = tx.name || tx.symbol;
  const units = formatUnits(tx.quantity ?? 1);
  const amount = formatMinor(Math.round(tx.amount * 10 ** currencyExponent(tx.currency)), tx.currency, locale);
  switch (tx.type) {
    case 'BOUGHT':
      return t('history.deleteBought', { units, name, date });
    case 'SOLD':
      return t('history.deleteSold', { units, name, date });
    case 'DEPOSIT':
      return t('history.deleteDeposit', { amount, date });
    case 'WITHDRAWAL':
      return t('history.deleteWithdrawal', { amount, date });
  }
}
