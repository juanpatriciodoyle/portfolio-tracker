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
  it('shows only clean positioning badges until the sources are opened', () => {
    const italy = { countryCode: 'IT', currency: 'EUR', equivalentMonthlyIncomeMinor: 580_000, incomePercentile: null };
    const benchmarks = makeBenchmarks({ phases: [makePhaseBenchmark({ nationalityEquivalences: [italy] })] });

    render(<BenchmarksCard phaseId="p1" view={view({ benchmarks })} />);

    expect(screen.getByRole('heading', { name: 'Where you stand' })).toBeInTheDocument();
    expect(screen.getByText('Top 11% in Spain')).toBeVisible();
    expect(screen.getByText('Holds the purchasing power of €5,800 a month in Italy')).toBeVisible();
    expect(screen.getByText('Data sources').closest('details')).not.toHaveAttribute('open');
  });

  it('keeps figures, formulas and what is not connected inside the collapsed data sources', () => {
    render(<BenchmarksCard phaseId="p1" view={view()} />);

    fireEvent.click(screen.getByText('Data sources'));

    expect(screen.getByText('42.8% housing burden')).toBeInTheDocument();
    expect(screen.getByText(/Rent, utilities and property taxes come to/)).toBeInTheDocument();
    expect(screen.getByText('1.4x purchasing power')).toBeInTheDocument();
    expect(screen.getByText(/A global ranking needs a worldwide income distribution/)).toBeInTheDocument();
    expect(screen.getByText(/national averages, not figures for your city/)).toBeInTheDocument();
    expect(screen.getByText(/Argentine figures are in current pesos/)).toBeInTheDocument();
    expect(screen.getByText(/Last refreshed .*2026/)).toBeInTheDocument();
  });

  it('puts what it lacks inside the data sources and shows what it has', () => {
    const partial = makeBenchmarks({
      phases: [makePhaseBenchmark({ incomePercentile: null, housingBurden: null, gaps: ['NO_DISTRIBUTION', 'NO_HOUSING_BASELINE'] })],
    });

    render(<BenchmarksCard phaseId="p1" view={view({ benchmarks: partial })} />);

    expect(screen.queryByText(/^Top .* in Spain$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Data sources'));
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
    expect(screen.queryByText('Data sources')).not.toBeInTheDocument();
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
});
