import { isLocalCurrency, localCurrencyOf } from '../contracts';

describe('the currency of a country', () => {
  it('knows the currency of well-known countries, the euro area included', () => {
    expect(localCurrencyOf('ES')).toBe('EUR');
    expect(localCurrencyOf('AR')).toBe('ARS');
    expect(localCurrencyOf('GB')).toBe('GBP');
    expect(localCurrencyOf('US')).toBe('USD');
  });

  it('does not guess for a country that is not listed', () => {
    expect(localCurrencyOf('ZZ')).toBeNull();
    expect(isLocalCurrency('ZZ', 'EUR')).toBe(true);
  });

  it('says whether an amount is in the currency of the country', () => {
    expect(isLocalCurrency('ES', 'EUR')).toBe(true);
    expect(isLocalCurrency('ES', 'USD')).toBe(false);
  });
});
