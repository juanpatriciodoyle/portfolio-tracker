import { describe, expect, it } from 'vitest';
import { translatorFor } from '../../i18n/translate';
import { knownServerMessage } from '../serverMessages';

const refusal = (dependent: Record<string, string>) => ({
  error: 'Another transaction depends on this one (SOLD AAPL, 2026-02-01), so it cannot be changed this way.',
  code: 'TRANSACTION_REQUIRED_BY_LATER',
  dependent,
});
const sale = { id: 't9', type: 'SOLD', symbol: 'AAPL', date: '2026-02-01' };

describe('a change refused because a later transaction depends on it', () => {
  it('names that transaction, in English', () => {
    expect(knownServerMessage(refusal(sale), translatorFor('en'), 'en')).toBe(
      'This cannot change like that: a later transaction depends on it (sale of AAPL, Feb 1, 2026). Change or remove that one first.'
    );
  });

  it('names that transaction, in Argentine Spanish', () => {
    expect(knownServerMessage(refusal(sale), translatorFor('es-AR'), 'es-AR')).toBe(
      'No se puede cambiar así: una transacción posterior depende de esta (venta de AAPL, 1 de feb de 2026). Cambiá o eliminá primero esa.'
    );
  });

  it('leaves the instrument out for a deposit or a withdrawal, which have none', () => {
    const deposit = { id: 't3', type: 'DEPOSIT', symbol: 'CASH', date: '2026-01-05' };

    expect(knownServerMessage(refusal(deposit), translatorFor('en'), 'en')).toBe(
      'This cannot change like that: a later transaction depends on it (deposit, Jan 5, 2026). Change or remove that one first.'
    );
  });

  it('is not recognised when the answer does not carry the transaction that depends on it', () => {
    expect(knownServerMessage({ error: 'x', code: 'TRANSACTION_REQUIRED_BY_LATER' }, translatorFor('en'), 'en')).toBeNull();
  });
});
