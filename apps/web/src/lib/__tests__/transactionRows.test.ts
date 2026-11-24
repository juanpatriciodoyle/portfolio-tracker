import { describe, expect, it } from 'vitest';
import { translatorFor } from '../../i18n/translate';
import { cashHeldIn, correctionOf, deleteConsequence, describeRow, type EditableTransaction } from '../transactionRows';

const tx = (extra: Partial<EditableTransaction> = {}): EditableTransaction => ({
  id: 't1',
  type: 'BOUGHT',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  quantity: 10,
  amount: 1800,
  fee: 2,
  currency: 'EUR',
  date: '2026-03-03T00:00:00.000Z',
  paidWithCash: false,
  ...extra,
});
const edited = (extra: Partial<Parameters<typeof correctionOf>[1]> = {}) => ({ quantity: '10', amount: '1800', fee: '2', date: '2026-03-03', paidWithCash: false, ...extra });

describe('cashHeldIn: the cash a purchase can be paid with', () => {
  it('is the balance of that currency, never below zero', () => {
    const balances = [
      { currency: 'EUR', balance: 500 },
      { currency: 'USD', balance: -20 },
    ];

    expect(cashHeldIn(balances, 'EUR')).toBe(500);
    expect(cashHeldIn(balances, 'eur')).toBe(500);
    expect(cashHeldIn(balances, 'USD')).toBe(0);
    expect(cashHeldIn(balances, 'GBP')).toBe(0);
  });

  it('is nothing when the balances are not known yet', () => {
    expect(cashHeldIn(undefined, 'EUR')).toBe(0);
    expect(cashHeldIn([], 'EUR')).toBe(0);
  });
});

describe('correctionOf: only what the person changed is sent', () => {
  it('is empty when nothing changed, even if the numbers are written differently', () => {
    expect(correctionOf(tx(), edited())).toEqual({});
    expect(correctionOf(tx(), edited({ amount: '1800.00', quantity: '10.0', fee: '2.00' }))).toEqual({});
  });

  it('carries each changed field', () => {
    expect(correctionOf(tx(), edited({ amount: '1850.5', quantity: '11', fee: '0', date: '2026-03-04', paidWithCash: true }))).toEqual({
      amount: 1850.5,
      quantity: 11,
      fee: 0,
      date: '2026-03-04T00:00:00.000Z',
      paidWithCash: true,
    });
  });

  it('reads an empty fee as no fee', () => {
    expect(correctionOf(tx({ fee: 2 }), edited({ fee: '' }))).toEqual({ fee: 0 });
    expect(correctionOf(tx({ fee: 0 }), edited({ fee: '' }))).toEqual({});
  });

  it('never sends units for cash operations nor a cash payment for anything but a purchase', () => {
    const deposit = tx({ type: 'DEPOSIT', symbol: 'CASH', quantity: 1, amount: 500, fee: 0 });
    expect(correctionOf(deposit, edited({ quantity: '7', amount: '600', fee: '0', paidWithCash: true }))).toEqual({ amount: 600 });

    const sale = tx({ type: 'SOLD' });
    expect(correctionOf(sale, edited({ paidWithCash: true }))).toEqual({});
  });

  it('ignores what is not a number', () => {
    expect(correctionOf(tx(), edited({ amount: 'lots', quantity: '' }))).toEqual({});
  });
});

describe('describeRow: what a row is, in a few words (also its accessible name)', () => {
  it('names the kind, the instrument and the day', () => {
    expect(describeRow(tx(), translatorFor('en'), 'en-US')).toBe('Buy AAPL, Mar 3, 2026');
    expect(describeRow(tx({ type: 'DEPOSIT', symbol: 'CASH' }), translatorFor('en'), 'en-US')).toBe('Deposit, Mar 3, 2026');
  });
});

describe('deleteConsequence: what removing a transaction does, in words', () => {
  const en = translatorFor('en');
  const es = translatorFor('es-AR');

  it('says what is removed, with the units, the name and the day, and what is recalculated', () => {
    expect(deleteConsequence(tx(), en, 'en-US')).toBe('This removes the purchase of 10 Apple Inc. on Mar 3, 2026. Your holdings and profit will be recalculated.');
    expect(deleteConsequence(tx({ type: 'SOLD', quantity: 4, name: undefined }), en, 'en-US')).toBe(
      'This removes the sale of 4 AAPL on Mar 3, 2026. Your holdings, cash and profit will be recalculated.'
    );
  });

  it('says it for cash operations with the amount in their own currency', () => {
    expect(deleteConsequence(tx({ type: 'DEPOSIT', symbol: 'CASH', amount: 500 }), en, 'en-US')).toBe('This removes the deposit of €500 on Mar 3, 2026. Your cash and profit will be recalculated.');
    expect(deleteConsequence(tx({ type: 'WITHDRAWAL', symbol: 'CASH', amount: 120.5, currency: 'USD' }), en, 'en-US')).toBe('This removes the withdrawal of $120.50 on Mar 3, 2026. Your cash will be recalculated.');
  });

  it('says it in Argentine Spanish too', () => {
    expect(deleteConsequence(tx(), es, 'es-AR')).toMatch(/^Esto elimina la compra de 10 Apple Inc\. del 3 de mar de 2026\. Tus tenencias y tu ganancia se recalculan\.$/);
  });
});
