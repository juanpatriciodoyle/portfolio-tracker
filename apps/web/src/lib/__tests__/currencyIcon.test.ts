import { describe, it, expect } from 'vitest';
import { Coins, DollarSign, Euro, PoundSterling } from 'lucide-react';
import { currencyIcon } from '../currencyIcon';

describe('currencyIcon', () => {
  it('draws the symbol of the person\'s own currency', () => {
    expect(currencyIcon('EUR')).toBe(Euro);
    expect(currencyIcon('USD')).toBe(DollarSign);
    expect(currencyIcon('GBP')).toBe(PoundSterling);
  });

  it('reads the code in any case', () => {
    expect(currencyIcon('eur')).toBe(Euro);
    expect(currencyIcon(' usd ')).toBe(DollarSign);
  });

  it('never shows another currency\'s symbol for one it does not know', () => {
    expect(currencyIcon('JPY')).toBe(Coins);
    expect(currencyIcon('')).toBe(Coins);
  });
});
