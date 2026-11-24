import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HomeLoadError from '../HomeLoadError';

describe('HomeLoadError', () => {
  it('says calmly that the portfolio could not be loaded, and that nothing is lost', () => {
    render(<HomeLoadError onRetry={() => undefined} />);

    expect(screen.getByRole('alert').textContent).toContain('We could not load your portfolio');
    expect(screen.getByRole('alert').textContent).toContain('Nothing is lost');
  });

  it('offers a Try again button that asks for the figures once more', () => {
    const onRetry = vi.fn();
    render(<HomeLoadError onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
