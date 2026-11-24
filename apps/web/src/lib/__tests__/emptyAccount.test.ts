import { describe, it, expect } from 'vitest';
import { homeView, isEmptyAccount } from '../emptyAccount';

const nothing = { positions: [], soldAssets: [], cashBalance: 0, netWorth: 0, moneyPutIn: 0 };

describe('isEmptyAccount: nothing was ever logged', () => {
  it('is true with no holdings, no sales, no cash and no money put in', () => {
    expect(isEmptyAccount(nothing)).toBe(true);
  });

  it('is false with something held', () => {
    expect(isEmptyAccount({ ...nothing, positions: [{}] as never })).toBe(false);
  });

  it('is false after everything was sold: the history is there', () => {
    expect(isEmptyAccount({ ...nothing, soldAssets: [{}] as never })).toBe(false);
  });

  it('is false with only cash', () => {
    expect(isEmptyAccount({ ...nothing, cashBalance: 500, netWorth: 500, moneyPutIn: 500 })).toBe(false);
  });

  it('is false when money was put in and taken out again, which still leaves a history', () => {
    expect(isEmptyAccount({ ...nothing, moneyPutIn: 100 })).toBe(false);
  });
});

describe('homeView: which home to show', () => {
  const held = { ...nothing, positions: [{}] as never };

  it('waits while the first answer is on its way', () => {
    expect(homeView('loading', nothing)).toBe('loading');
  });

  it('asks for a first transaction only after a successful answer with nothing in it', () => {
    expect(homeView('ready', nothing)).toBe('first-transaction');
  });

  it('shows the portfolio after a successful answer with something in it', () => {
    expect(homeView('ready', held)).toBe('portfolio');
  });

  it('shows the failure, never the first-transaction dialog, when the server could not answer (the empty figures are not an answer)', () => {
    expect(homeView('failed', nothing)).toBe('failed');
    expect(homeView('failed', held)).toBe('failed');
  });
});
