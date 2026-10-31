import { findBillingPeriod, findDates } from '../domain/documentExtraction/dates';

const dates = (text: string, order: 'DMY' | 'MDY' | null = 'DMY') => findDates(text, order).map((mention) => mention.date);

describe('findDates: mixed locales, nothing guessed', () => {
  it('reads numeric dates with any common separator', () => {
    expect(dates('15/09/2026')).toEqual(['2026-09-15']);
    expect(dates('15-09-2026')).toEqual(['2026-09-15']);
    expect(dates('15.09.2026')).toEqual(['2026-09-15']);
    expect(dates('5/9/2026')).toEqual(['2026-09-05']);
    expect(dates('2026-09-15')).toEqual(['2026-09-15']);
    expect(dates('2026/09/15')).toEqual(['2026-09-15']);
  });

  it('reads written months in several languages, accents or not', () => {
    expect(dates('15 de septiembre de 2026')).toEqual(['2026-09-15']);
    expect(dates('1 de Marzo de 2026')).toEqual(['2026-03-01']);
    expect(dates('15 sep 2026')).toEqual(['2026-09-15']);
    expect(dates('15 Sept. 2026')).toEqual(['2026-09-15']);
    expect(dates('September 15, 2026')).toEqual(['2026-09-15']);
    expect(dates('Sep 15th, 2026')).toEqual(['2026-09-15']);
    expect(dates('15 September 2026')).toEqual(['2026-09-15']);
    expect(dates('15 de março de 2026')).toEqual(['2026-03-15']);
    expect(dates('15 février 2026')).toEqual(['2026-02-15']);
    expect(dates('15. März 2026')).toEqual(['2026-03-15']);
    expect(dates('12 dicembre 2026')).toEqual(['2026-12-12']);
    expect(dates('1 DE ENERO DE 2027')).toEqual(['2027-01-01']);
  });

  it('uses the expected day/month order only when a date could be read both ways', () => {
    expect(dates('03/04/2026', 'DMY')).toEqual(['2026-04-03']);
    expect(dates('03/04/2026', 'MDY')).toEqual(['2026-03-04']);
    expect(dates('03/04/2026', null)).toEqual([]);
  });

  it('reads an unambiguous date whatever the expected order', () => {
    expect(dates('13/04/2026', null)).toEqual(['2026-04-13']);
    expect(dates('04/13/2026', null)).toEqual(['2026-04-13']);
    expect(dates('13/04/2026', 'MDY')).toEqual(['2026-04-13']);
    expect(dates('03/03/2026', null)).toEqual(['2026-03-03']);
  });

  it('reads a two-digit year as this century', () => {
    expect(dates('15/09/26')).toEqual(['2026-09-15']);
  });

  it('skips dates that do not exist', () => {
    expect(dates('31/02/2026')).toEqual([]);
    expect(dates('29/02/2026')).toEqual([]);
    expect(dates('29/02/2028')).toEqual(['2028-02-29']);
    expect(dates('00/09/2026')).toEqual([]);
    expect(dates('15/13/2026', null)).toEqual([]);
    expect(dates('31 de abril de 2026')).toEqual([]);
  });

  it('skips numbers that only look like dates', () => {
    expect(dates('Ref 12345678901234')).toEqual([]);
    expect(dates('IBAN ES91 2100 0418 4502 0005 1332')).toEqual([]);
    expect(dates('versión 1.2.2026.4')).toEqual([]);
    expect(dates('15/09/1850')).toEqual([]);
    expect(dates('Septiembre 2026')).toEqual([]);
  });

  it('keeps the order in which dates appear', () => {
    expect(dates('del 01/09/2026 al 30/09/2026, emitida el 05/10/2026')).toEqual(['2026-09-01', '2026-09-30', '2026-10-05']);
  });
});

describe('findBillingPeriod', () => {
  it.each([
    ['Periodo de facturación: 01/09/2026 - 30/09/2026', ['2026-09-01', '2026-09-30']],
    ['Período: del 01/07/2026 al 31/08/2026', ['2026-07-01', '2026-08-31']],
    ['Consumo desde 15 de julio de 2026 hasta 14 de septiembre de 2026', ['2026-07-15', '2026-09-14']],
    ['Billing period: Sep 1, 2026 to Sep 30, 2026', ['2026-09-01', '2026-09-30']],
    ['Service period 2026-10-01 – 2026-10-31', ['2026-10-01', '2026-10-31']],
    ['Facturación del 1 al 31 de octubre de 2026 emitida', null],
    ['Abrechnungszeitraum: 01.10.2026 - 31.10.2026', ['2026-10-01', '2026-10-31']],
    ['Période du 01/10/2026 au 31/10/2026', ['2026-10-01', '2026-10-31']],
  ] as const)('%s', (text, expected) => {
    const period = findBillingPeriod(text, 'DMY');
    expect(period && [period.start, period.end]).toEqual(expected);
  });

  it('finds the dates on the line after a period label', () => {
    expect(findBillingPeriod('Periodo de facturación\n01/09/2026 - 30/09/2026\nTotal 96,50 €', 'DMY')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('answers nothing when a period ends before it starts', () => {
    expect(findBillingPeriod('Periodo: 30/09/2026 - 01/09/2026', 'DMY')).toBeNull();
  });

  it('answers nothing when two different periods compete', () => {
    expect(findBillingPeriod('Periodo: 01/08/2026 - 31/08/2026\nPeriodo: 01/09/2026 - 30/09/2026', 'DMY')).toBeNull();
  });

  it('accepts the same period said twice', () => {
    expect(findBillingPeriod('Periodo: 01/09/2026 - 30/09/2026\nDel 01/09/2026 al 30/09/2026', 'DMY')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('answers nothing for an issue date alone or an ambiguous pair', () => {
    expect(findBillingPeriod('Fecha de emisión: 05/10/2026', 'DMY')).toBeNull();
    expect(findBillingPeriod('Periodo: 03/04/2026 - 04/05/2026', null)).toBeNull();
  });

  it('answers nothing for a period of more than a few hundred days', () => {
    expect(findBillingPeriod('Periodo: 01/01/2020 - 31/12/2026', 'DMY')).toBeNull();
  });
});
