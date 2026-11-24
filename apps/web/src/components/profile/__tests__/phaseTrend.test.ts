import { describe, expect, it } from 'vitest';
import { translateEnglish as t, translatorFor } from '../../../i18n/translate';
import { costTrend, daysByMonth, describeTrend, savingsTrend, type BillLike } from '../phaseTrend';

/** A monthly bill for the whole of one calendar month. */
const bill = (category: BillLike['category'], month: string, amountMinor: number): BillLike => {
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { category, periodStart: `${month}-01`, periodEnd: `${month}-${String(last).padStart(2, '0')}`, amountMinor };
};

// "Today" is the 15th of November: the last month that is over is October, so the windows are Aug-Oct and May-Jul.
const ASOF = '2026-11-15';
const steady = (category: BillLike['category'], months: string[], amountMinor: number) => months.map((month) => bill(category, month, amountMinor));
const EARLIER = ['2026-05', '2026-06', '2026-07'];
const RECENT = ['2026-08', '2026-09', '2026-10'];

describe('daysByMonth', () => {
  it('counts the days of a period in each calendar month it touches, both ends included', () => {
    expect(daysByMonth('2026-01-20', '2026-02-10')).toEqual(
      new Map([
        ['2026-01', 12],
        ['2026-02', 10],
      ])
    );
  });

  it('knows a leap February', () => {
    expect(daysByMonth('2028-02-01', '2028-02-29')).toEqual(new Map([['2028-02', 29]]));
  });
});

describe('costTrend', () => {
  it('says costs rose when the last three months average clearly more than the three before, and since which month', () => {
    const records = [...steady('INTERNET', EARLIER, 4000), ...steady('INTERNET', RECENT, 4000), ...steady('GAS', EARLIER, 3000), ...steady('GAS', RECENT, 7700)];

    const trend = costTrend(records, ASOF, 'EUR');

    // The average month went from 70 to 117 euros: 47 more, and gas is all of it.
    expect(trend).toEqual({ direction: 'rose', changeMinor: 4700, sinceMonth: '2026-08', biggestCategory: 'GAS' });
  });

  it('says costs fell, and does not name a category when no single one is most of the change', () => {
    const records = [
      ...steady('INTERNET', EARLIER, 5000),
      ...steady('INTERNET', RECENT, 4000),
      ...steady('WATER', EARLIER, 5000),
      ...steady('WATER', RECENT, 4000),
      ...steady('GAS', EARLIER, 5000),
      ...steady('GAS', RECENT, 4000),
    ];

    expect(costTrend(records, ASOF, 'EUR')).toEqual({ direction: 'fell', changeMinor: 3000, sinceMonth: '2026-08', biggestCategory: null });
  });

  it('keeps quiet below 3 bills: two bills are not a trend', () => {
    expect(costTrend([bill('GAS', '2026-06', 3000), bill('GAS', '2026-09', 9000)], ASOF, 'EUR')).toBeNull();
  });

  it('keeps quiet when one of the two windows has no bill at all', () => {
    expect(costTrend(steady('GAS', RECENT, 9000), ASOF, 'EUR')).toBeNull();
    expect(costTrend(steady('GAS', EARLIER, 9000), ASOF, 'EUR')).toBeNull();
  });

  it('keeps quiet for a change under 10%', () => {
    const records = [...steady('INTERNET', EARLIER, 40000), ...steady('INTERNET', RECENT, 43900)];

    expect(costTrend(records, ASOF, 'EUR')).toBeNull();
  });

  it('keeps quiet for a change under 5 in the currency, even when it is over 10%', () => {
    const records = [...steady('WATER', EARLIER, 2000), ...steady('WATER', RECENT, 2400)];

    expect(costTrend(records, ASOF, 'EUR')).toBeNull();
  });

  it('reads the 5 in the units of the currency: 5 yen is 5, not 500', () => {
    const records = [...steady('WATER', EARLIER, 20), ...steady('WATER', RECENT, 30)];

    expect(costTrend(records, ASOF, 'JPY')).toEqual({ direction: 'rose', changeMinor: 10, sinceMonth: '2026-08', biggestCategory: 'WATER' });
    expect(costTrend(records.map((record) => ({ ...record, amountMinor: record.amountMinor / 4 })), ASOF, 'JPY')).toBeNull();
  });

  it('leaves heating and cooling out: winter against summer is the weather, not a trend', () => {
    const records = [...steady('HEATING_COOLING', EARLIER, 2000), ...steady('HEATING_COOLING', RECENT, 20000), ...steady('INTERNET', EARLIER, 4000), ...steady('INTERNET', RECENT, 4000)];

    expect(costTrend(records, ASOF, 'EUR')).toBeNull();
  });

  it('spreads a bill that covers several months over the months it covers', () => {
    // One bill for May to July (3 months) and one for August to October at three times the price.
    const records: BillLike[] = [
      { category: 'WATER', periodStart: '2026-05-01', periodEnd: '2026-07-31', amountMinor: 9000 },
      { category: 'WATER', periodStart: '2026-08-01', periodEnd: '2026-10-31', amountMinor: 27000 },
      bill('INTERNET', '2026-07', 1),
    ];

    expect(costTrend(records, ASOF, 'EUR')).toMatchObject({ direction: 'rose', biggestCategory: 'WATER' });
  });

  it('ignores bills outside the six months it compares', () => {
    const records = [...steady('GAS', ['2025-01', '2025-02', '2025-03'], 9000), ...steady('GAS', EARLIER, 3000), ...steady('GAS', RECENT, 3000)];

    expect(costTrend(records, ASOF, 'EUR')).toBeNull();
  });

  it('works across the new year', () => {
    const records = [...steady('GAS', ['2025-11', '2025-12', '2026-01'], 3000), ...steady('GAS', ['2026-02', '2026-03', '2026-04'], 9000)];

    expect(costTrend(records, '2026-05-10', 'EUR')).toMatchObject({ direction: 'rose', sinceMonth: '2026-02' });
  });
});

describe('savingsTrend', () => {
  it('says the share kept went up or down against the previous home', () => {
    expect(savingsTrend(0.69, 0.58)).toEqual({ direction: 'up', from: 0.58, to: 0.69 });
    expect(savingsTrend(0.4, 0.58)).toEqual({ direction: 'down', from: 0.58, to: 0.4 });
  });

  it('keeps quiet for a change under 5 points, and without income in either home', () => {
    expect(savingsTrend(0.6, 0.58)).toBeNull();
    expect(savingsTrend(null, 0.58)).toBeNull();
    expect(savingsTrend(0.6, null)).toBeNull();
  });
});

describe('describeTrend', () => {
  it('words a cost trend with the amount and the month, and names the category when there is one', () => {
    expect(describeTrend({ direction: 'rose', changeMinor: 3700, sinceMonth: '2026-08', biggestCategory: 'INTERNET' }, 'EUR', 'en-GB', t)).toBe(
      'Your bills rose €37 a month since August. Internet is most of it.'
    );
    expect(describeTrend({ direction: 'fell', changeMinor: 3000, sinceMonth: '2026-08', biggestCategory: null }, 'EUR', 'en-GB', t)).toBe('Your bills fell €30 a month since August.');
  });

  it('words a savings trend against the previous home', () => {
    expect(describeTrend({ direction: 'up', from: 0.58, to: 0.69, previousName: 'Barcelona' }, 'EUR', 'en-GB', t)).toBe('You keep 69% after fixed costs, up from 58% in Barcelona.');
    expect(describeTrend({ direction: 'down', from: 0.58, to: 0.4, previousName: 'Barcelona' }, 'EUR', 'en-GB', t)).toBe('You keep 40% after fixed costs, down from 58% in Barcelona.');
  });

  it('speaks Argentine Spanish', () => {
    const es = translatorFor('es-AR');

    expect(describeTrend({ direction: 'rose', changeMinor: 3700, sinceMonth: '2026-08', biggestCategory: null }, 'EUR', 'es-AR', es)).toMatch(/^Tus facturas subieron .*37.* por mes desde agosto\.$/);
  });
});
