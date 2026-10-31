import { findAmounts, parseDecimal, toMinorUnits } from '../domain/documentExtraction/amounts';

describe('parseDecimal: locale-aware, and silent when a number could be read two ways', () => {
  it.each([
    ['1.234,56', '1234.56'],
    ['1,234.56', '1234.56'],
    ['1 234,56', '1234.56'],
    ['1 234,56', '1234.56'],
    ['1 234,56', '1234.56'],
    ["1'234.56", '1234.56'],
    ['1234,56', '1234.56'],
    ['1234.56', '1234.56'],
    ['96,5', '96.5'],
    ['96.50', '96.50'],
    ['0,99', '0.99'],
    ['0.123', '0.123'],
    ['1.234.567,89', '1234567.89'],
    ['1,234,567.89', '1234567.89'],
    ['1.234.567', '1234567'],
    ['1234', '1234'],
    ['12,3456', '12.3456'],
  ])('reads %s as %s', (raw, expected) => {
    expect(parseDecimal(raw)).toBe(expected);
  });

  it.each(['1.234', '1,234', '12.345', '999,999'])('refuses %s: a thousands separator or a decimal point, nobody can tell', (raw) => {
    expect(parseDecimal(raw)).toBeNull();
  });

  it.each(['', ' ', 'abc', '-45,00', '1.23.45', '1,23,456.78', '12,34,56', '1..2', '.5', '5.', '1.234,56,7', '١٢٣'])('refuses malformed %j', (raw) => {
    expect(parseDecimal(raw)).toBeNull();
  });
});

describe('toMinorUnits', () => {
  it('converts exactly, without floating point', () => {
    expect(toMinorUnits('1234.56', 2)).toBe(123456);
    expect(toMinorUnits('96.5', 2)).toBe(9650);
    expect(toMinorUnits('1234', 2)).toBe(123400);
    expect(toMinorUnits('0.29', 2)).toBe(29);
    expect(toMinorUnits('4.35', 2)).toBe(435);
    expect(toMinorUnits('12.340', 2)).toBe(1234);
    expect(toMinorUnits('100', 0)).toBe(100);
    expect(toMinorUnits('1.234', 3)).toBe(1234);
  });

  it('refuses to round', () => {
    expect(toMinorUnits('12.345', 2)).toBeNull();
    expect(toMinorUnits('12.5', 0)).toBeNull();
  });

  it('refuses zero and amounts beyond the accepted maximum', () => {
    expect(toMinorUnits('0', 2)).toBeNull();
    expect(toMinorUnits('0.00', 2)).toBeNull();
    expect(toMinorUnits('99999999999', 2)).toBeNull();
  });
});

describe('findAmounts: what a line says it costs', () => {
  it('reads an amount with its currency mark, before or after', () => {
    expect(findAmounts('Total a pagar: 96,50 €')).toEqual([{ decimal: '96.50', currency: 'EUR', dollarSign: false }]);
    expect(findAmounts('Total due £84.32')).toEqual([{ decimal: '84.32', currency: 'GBP', dollarSign: false }]);
    expect(findAmounts('Importe EUR 1.234,56')).toEqual([{ decimal: '1234.56', currency: 'EUR', dollarSign: false }]);
    expect(findAmounts('Total ARS 45.320,50')).toEqual([{ decimal: '45320.50', currency: 'ARS', dollarSign: false }]);
    expect(findAmounts('Total US$ 129.99')).toEqual([{ decimal: '129.99', currency: 'USD', dollarSign: false }]);
    expect(findAmounts('Total AR$ 1.000,00')).toEqual([{ decimal: '1000.00', currency: 'ARS', dollarSign: false }]);
    expect(findAmounts('Total 12,99 euros')).toEqual([{ decimal: '12.99', currency: 'EUR', dollarSign: false }]);
  });

  it('marks a bare dollar sign as ambiguous instead of choosing a country', () => {
    expect(findAmounts('Total $ 45.320,50')).toEqual([{ decimal: '45320.50', currency: null, dollarSign: true }]);
    expect(findAmounts('Total Due $129.99')).toEqual([{ decimal: '129.99', currency: null, dollarSign: true }]);
  });

  it('accepts a currency-less number only when it has a decimal part', () => {
    expect(findAmounts('Total 96,50')).toEqual([{ decimal: '96.50', currency: null, dollarSign: false }]);
    expect(findAmounts('Factura 2026 número 123456')).toEqual([]);
  });

  it('skips dates, percentages, quantities and identifiers', () => {
    expect(findAmounts('Fecha 15/09/2026 IVA 21% consumo 245,50 kWh agua 12,5 m3 NIF B12345678')).toEqual([]);
    expect(findAmounts('Teléfono 912 345 678 contrato 4500123,50')).toEqual([{ decimal: '4500123.50', currency: null, dollarSign: false }]);
  });

  it('returns several amounts in order', () => {
    expect(findAmounts('Base 79,75 € IVA 16,75 € Total 96,50 €').map((amount) => amount.decimal)).toEqual(['79.75', '16.75', '96.50']);
  });

  it('reads a lone separator before three digits as thousands when a currency says there are no thousandths', () => {
    expect(findAmounts('Total 1.234 €')).toEqual([{ decimal: '1234', currency: 'EUR', dollarSign: false }]);
    expect(findAmounts('Total 4,980 JPY')).toEqual([{ decimal: '4980', currency: 'JPY', dollarSign: false }]);
  });

  it('skips that same number without a currency, where nobody can tell', () => {
    expect(findAmounts('Total 1.234')).toEqual([]);
  });
});
