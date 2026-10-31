import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeBenchmarks, makePhaseBenchmark } from '../../../test/benchmarkFixtures';
import BenchmarksCard from '../BenchmarksCard';
import type { BenchmarksView } from '../billingView';

const view = (overrides: Partial<BenchmarksView> = {}): BenchmarksView => ({
  status: 'ready',
  message: null,
  benchmarks: makeBenchmarks(),
  onRetry: vi.fn(),
  nameOf: (id) => (id === 'p0' ? 'Buenos Aires' : undefined),
  ...overrides,
});

describe('BenchmarksCard', () => {
  it('shows income, housing and purchasing power for the phase', () => {
    render(<BenchmarksCard phaseId="p1" view={view()} />);

    expect(screen.getByRole('heading', { name: 'How you compare' })).toBeInTheDocument();
    expect(screen.getByText(/higher than about 89 of every 100 people in/)).toBeInTheDocument();
    expect(screen.getByText(/Housing takes 42.8% of your income/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'You 42.8%, typical 16%' })).toBeInTheDocument();
    expect(screen.getByText(/buys about \$5,604 a month/)).toBeInTheDocument();
    expect(screen.getByText('That is 1.59x what you had in Buenos Aires.')).toBeInTheDocument();
  });

  it('shows what it has and says why it lacks the rest', () => {
    const partial = makeBenchmarks({
      phases: [makePhaseBenchmark({ incomePercentile: null, housingBurden: null, gaps: ['NO_DISTRIBUTION', 'NO_HOUSING_BASELINE'] })],
    });

    render(<BenchmarksCard phaseId="p1" view={view({ benchmarks: partial })} />);

    expect(screen.queryByText(/higher than about/)).not.toBeInTheDocument();
    expect(screen.getByText(/buys about/)).toBeInTheDocument();
    expect(screen.getByText(/No income statistics are published for this country/)).toBeInTheDocument();
    expect(screen.getByText(/No typical housing cost figure/)).toBeInTheDocument();
  });

  it('asks for an income when the phase has none', () => {
    const empty = makeBenchmarks({
      phases: [makePhaseBenchmark({ monthlyIncomeMinor: 0, incomePercentile: null, housingBurden: null, purchasingPower: null, gaps: ['NO_INCOME'] })],
    });

    render(<BenchmarksCard phaseId="p1" view={view({ benchmarks: empty })} />);

    expect(screen.getByText(/Add a monthly income to this living phase/)).toBeInTheDocument();
    expect(screen.queryByText(/Housing takes/)).not.toBeInTheDocument();
  });

  it('shows a loading placeholder before the first answer', () => {
    render(<BenchmarksCard phaseId="p1" view={view({ status: 'loading', benchmarks: null })} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading comparisons…');
    expect(screen.queryByText(/How this is worked out/)).not.toBeInTheDocument();
  });

  it('shows the problem with a retry when loading failed', () => {
    const onRetry = vi.fn();
    render(<BenchmarksCard phaseId="p1" view={view({ status: 'error', message: 'Could not reach the server.', benchmarks: null, onRetry })} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says so when the server has no figures for this phase', () => {
    render(<BenchmarksCard phaseId="other" view={view()} />);

    expect(screen.getByText(/No comparison is available for this living phase yet/)).toBeInTheDocument();
  });

  it('explains how it is worked out, with the refresh date', () => {
    render(<BenchmarksCard phaseId="p1" view={view()} />);

    const summary = screen.getByText('How this is worked out');
    fireEvent.click(summary);

    expect(screen.getByText(/national averages, not figures for your city/)).toBeInTheDocument();
    expect(screen.getByText(/assume 1 adult and no children/)).toBeInTheDocument();
    expect(screen.getByText(/Argentine figures are in current pesos/)).toBeInTheDocument();
    expect(screen.getByText(/Last refreshed .*2026/)).toBeInTheDocument();
  });
});
