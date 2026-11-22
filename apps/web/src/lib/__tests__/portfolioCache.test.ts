import { describe, it, expect } from 'vitest';
import { createPortfolioCache, PORTFOLIO_CACHE_MAX_AGE_MS } from '../portfolioCache';

const answer = (value: number) => ({ stats: { netWorth: value }, history: [{ value }] });

describe('portfolioCache', () => {
  it('gives back what was stored for the same person', () => {
    const cache = createPortfolioCache<ReturnType<typeof answer>>();
    cache.write('token-a', answer(1), 1000);
    expect(cache.read('token-a', 2000)).toEqual(answer(1));
  });

  it('knows nothing about someone else or about nobody', () => {
    const cache = createPortfolioCache<ReturnType<typeof answer>>();
    cache.write('token-a', answer(1), 0);
    expect(cache.read('token-b', 0)).toBeNull();
    expect(cache.read(null, 0)).toBeNull();
  });

  it('stores nothing for nobody', () => {
    const cache = createPortfolioCache<ReturnType<typeof answer>>();
    cache.write(null, answer(1), 0);
    expect(cache.read(null, 0)).toBeNull();
  });

  it('lets go of an answer that has got too old to show first', () => {
    const cache = createPortfolioCache<ReturnType<typeof answer>>();
    cache.write('token-a', answer(1), 0);
    expect(cache.read('token-a', PORTFOLIO_CACHE_MAX_AGE_MS - 1)).toEqual(answer(1));
    expect(cache.read('token-a', PORTFOLIO_CACHE_MAX_AGE_MS)).toBeNull();
  });

  it('keeps only the latest answer per person', () => {
    const cache = createPortfolioCache<ReturnType<typeof answer>>();
    cache.write('token-a', answer(1), 0);
    cache.write('token-a', answer(2), 10);
    expect(cache.read('token-a', 20)).toEqual(answer(2));
  });

  it('forgets everyone on clear (signing out)', () => {
    const cache = createPortfolioCache<ReturnType<typeof answer>>();
    cache.write('token-a', answer(1), 0);
    cache.write('token-b', answer(2), 0);
    cache.clear();
    expect(cache.read('token-a', 1)).toBeNull();
    expect(cache.read('token-b', 1)).toBeNull();
  });
});
