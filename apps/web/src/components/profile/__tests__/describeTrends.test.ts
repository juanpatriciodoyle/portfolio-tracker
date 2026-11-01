import { describe, expect, it } from 'vitest';
import { makeEmptyTrends, makeObserved, makeTrends, makeWindow, makeWindows } from '../../../test/fixtures';
import { describeWindow, groupTrendsByCurrency, hasAnyBills } from '../describeTrends';

describe('describeWindow', () => {
  it('shows the average with no hint when every month of the window has bills', () => {
    expect(describeWindow(makeWindow(3, { averageMinor: 131050 }), 'EUR', 'en-US')).toEqual({
      windowMonths: 3,
      label: '3 months',
      amount: '€1,310.50',
      hint: null,
    });
  });

  it('says how much of the window the average is based on when only part of it has bills', () => {
    expect(describeWindow(makeWindow(6, { coveredMonths: 2 }), 'EUR', 'en-US').hint).toBe('based on 2 of 6 months');
    expect(describeWindow(makeWindow(3, { coveredMonths: 1 }), 'EUR', 'en-US').hint).toBe('based on 1 of 3 months');
  });

  it('shows an em dash, not zero, when no bill touches the window', () => {
    expect(describeWindow(makeWindow(12, { coveredMonths: 0, averageMinor: null, totalMinor: 0 }), 'EUR', 'en-US')).toMatchObject({
      amount: '—',
      hint: 'no bills',
    });
  });

  it('formats in the currency of the amounts', () => {
    expect(describeWindow(makeWindow(3, { averageMinor: 4000000 }), 'ARS', 'en-US').amount).toMatch(/ARS\s?40,000/);
  });
});

describe('groupTrendsByCurrency', () => {
  it('makes one block per currency, windows shortest first', () => {
    const trends = makeTrends({
      fixedCosts: [{ currency: 'EUR', windows: [makeWindow(12), makeWindow(3), makeWindow(6)] }],
    });

    const [block] = groupTrendsByCurrency(trends, 'en-US');

    expect(block.currency).toBe('EUR');
    expect(block.fixedCosts.map((figure) => figure.windowMonths)).toEqual([3, 6, 12]);
  });

  it('keeps currencies apart, in the order the server listed them', () => {
    const trends = makeTrends({
      fixedCosts: [makeWindows('EUR'), makeWindows('ARS')],
      subscriptions: [makeWindows('ARS')],
    });

    expect(groupTrendsByCurrency(trends, 'en-US').map((block) => block.currency)).toEqual(['EUR', 'ARS']);
  });

  it('shows dashes for a row the server left out', () => {
    const trends = makeTrends({ fixedCosts: [makeWindows('EUR')], subscriptions: [] });

    const [block] = groupTrendsByCurrency(trends, 'en-US');

    expect(block.subscriptions.map((figure) => figure.amount)).toEqual(['—', '—', '—']);
    expect(block.subscriptions.map((figure) => figure.hint)).toEqual(['no bills', 'no bills', 'no bills']);
  });

  it('is empty when there are no currencies at all', () => {
    expect(groupTrendsByCurrency(makeTrends({ fixedCosts: [], subscriptions: [] }), 'en-US')).toEqual([]);
  });
});

describe('hasAnyBills', () => {
  it('is false when no window and no phase has a bill behind it', () => {
    expect(hasAnyBills(makeEmptyTrends())).toBe(false);
  });

  it('is true when any window or any phase is covered', () => {
    expect(hasAnyBills(makeTrends())).toBe(true);
    expect(hasAnyBills({ ...makeEmptyTrends(), phases: [makeObserved()] })).toBe(true);
  });
});
