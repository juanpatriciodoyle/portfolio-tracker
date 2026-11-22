import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatCalendarDate } from '../../../lib/money';
import { makeUsageAnalytics } from '../../../test/fixtures';
import { pendingRequest, tapTwice } from '../../../test/doubleTap';
import UsageAnalytics from '../UsageAnalytics';

// Figures count up in the browser; here they are simply their final value.
vi.mock('../../../lib/prefersReducedMotion', () => ({ prefersReducedMotion: () => true }));

const ready = { status: 'ready' as const, message: null, analytics: makeUsageAnalytics(), onRetry: vi.fn() };

describe('UsageAnalytics', () => {
  it('shows how many customers there are and how many are active, side by side', () => {
    render(<UsageAnalytics {...ready} />);

    const figures = document.querySelectorAll('.usage-analytics__figure');
    expect(figures).toHaveLength(2);
    expect(figures[0]).toHaveTextContent('Customers');
    expect(screen.getByRole('img', { name: '48' })).toBeInTheDocument();
    expect(figures[1]).toHaveTextContent('Active customers');
    expect(screen.getByRole('img', { name: '30' })).toBeInTheDocument();
  });

  it('says what share are active and what "active" means, in the dates the server used', () => {
    render(<UsageAnalytics {...ready} />);

    expect(screen.getByText('62.5% of customers')).toBeInTheDocument();
    expect(screen.getByText(`Signed in since ${formatCalendarDate('2026-08-22')} (the last 3 months)`)).toBeInTheDocument();
    expect(screen.getByText(`As of ${formatCalendarDate('2026-11-22')}`)).toBeInTheDocument();
  });

  it('shows a whole number without decimals', () => {
    render(<UsageAnalytics {...ready} analytics={makeUsageAnalytics({ registered: 4, active: 4, activePercent: 100 })} />);
    expect(screen.getByText('100% of customers')).toBeInTheDocument();
  });

  it('groups thousands', () => {
    render(<UsageAnalytics {...ready} analytics={makeUsageAnalytics({ registered: 1284, active: 900, activePercent: 70.1 })} />);
    expect(screen.getByRole('img', { name: /^1.?284$/ })).toBeInTheDocument();
  });

  it('holds its place while loading, with no figures', () => {
    render(<UsageAnalytics {...ready} status="loading" analytics={null} />);
    expect(screen.getByRole('region', { name: 'Customers' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps showing the last figures while it reloads', () => {
    render(<UsageAnalytics {...ready} status="loading" />);
    expect(screen.getByRole('img', { name: '48' })).toBeInTheDocument();
  });

  it('says there are no customers yet instead of showing zeros as a result', () => {
    render(<UsageAnalytics {...ready} analytics={makeUsageAnalytics({ registered: 0, active: 0, activePercent: 0 })} />);
    expect(screen.getByText('No customers yet')).toBeInTheDocument();
    expect(screen.queryByText(/of customers/)).not.toBeInTheDocument();
  });

  it('says what went wrong and offers to try again', () => {
    const onRetry = vi.fn();
    render(<UsageAnalytics status="error" message="Could not reach the server. Check your connection and try again." analytics={null} onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server. Check your connection and try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('asks again once when the retry is tapped twice', async () => {
    const pending = pendingRequest<void>();
    const onRetry = vi.fn(() => pending.promise);
    render(<UsageAnalytics status="error" message="Something went wrong." analytics={null} onRetry={onRetry} />);

    tapTwice(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('only says the session ended, with nothing to retry, when the person is signed out', () => {
    render(<UsageAnalytics status="signed-out" message="Your session has ended. Sign in again to continue." analytics={null} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your session has ended. Sign in again to continue.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
