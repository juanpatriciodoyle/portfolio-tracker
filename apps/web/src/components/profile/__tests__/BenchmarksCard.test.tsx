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
    const kpi = (metric: string) => screen.getByText((_, element) => element?.getAttribute('data-metric') === metric);
    expect(kpi('income')).toHaveTextContent('89th percentileTop 11%');
    expect(kpi('housing')).toHaveTextContent('42.8% housing burdenvs. 16% typical');
    expect(kpi('purchasing-power')).toHaveTextContent('1.4x purchasing power');
    expect(screen.getAllByRole('listitem').filter((item) => item.hasAttribute('data-metric'))).toHaveLength(3);
  });

  it('keeps methodology out of the visible text and in tooltips reachable by keyboard', () => {
    render(<BenchmarksCard phaseId="p1" view={view()} />);

    const housing = screen.getByText('42.8% housing burden').closest('li')!;
    expect(housing).toHaveAttribute('tabindex', '0');
    expect(housing).toHaveAccessibleDescription(/Rent, utilities and property taxes/);
    expect(screen.queryByText(/adjusted for household size/)).toHaveAttribute('role', 'tooltip');
    expect(screen.queryByText(/international dollars/)).toHaveAttribute('role', 'tooltip');
  });

  it('shows what it has and says why it lacks the rest', () => {
    const partial = makeBenchmarks({
      phases: [makePhaseBenchmark({ incomePercentile: null, housingBurden: null, gaps: ['NO_DISTRIBUTION', 'NO_HOUSING_BASELINE'] })],
    });

    render(<BenchmarksCard phaseId="p1" view={view({ benchmarks: partial })} />);

    expect(screen.queryByText(/percentile/)).not.toBeInTheDocument();
    expect(screen.getByText(/purchasing power/)).toBeInTheDocument();
    expect(screen.getByText(/No income statistics are published for this country/)).toBeInTheDocument();
    expect(screen.getByText(/No typical housing cost figure/)).toBeInTheDocument();
  });

  it('asks for an income when the phase has none', () => {
    const empty = makeBenchmarks({
      phases: [makePhaseBenchmark({ monthlyIncomeMinor: 0, incomePercentile: null, housingBurden: null, purchasingPower: null, gaps: ['NO_INCOME'] })],
    });

    render(<BenchmarksCard phaseId="p1" view={view({ benchmarks: empty })} />);

    expect(screen.getByText(/Add a monthly income to this living phase/)).toBeInTheDocument();
    expect(screen.queryByText(/housing burden/)).not.toBeInTheDocument();
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
