import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeEmptyTrends, makeTrends, makeWindow, makeWindows } from '../../../test/fixtures';
import TrendsCard from '../TrendsCard';

function renderCard(props: Partial<React.ComponentProps<typeof TrendsCard>> = {}) {
  const onRetry = vi.fn();
  render(<TrendsCard status="ready" trends={makeTrends()} message={null} onRetry={onRetry} {...props} />);
  return { onRetry };
}

const rowOf = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}`) });

describe('TrendsCard with bills', () => {
  it('shows the 3, 6 and 12 month averages side by side, for fixed costs and for subscriptions', () => {
    renderCard();

    expect(screen.getByRole('heading', { level: 2, name: 'Trends' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual(['Kind of cost', '3 months', '6 months', '12 months']);
    expect(within(rowOf('Fixed costs')).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['€1,000', '€1,000', '€1,000']);
    expect(within(rowOf('Subscriptions')).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['€15', '€14', '€13']);
  });

  it('has no currency heading when everything is in one currency', () => {
    renderCard();

    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('says quietly when a window is only partly covered by bills', () => {
    renderCard({
      trends: makeTrends({
        fixedCosts: [makeWindows('EUR', { 6: { coveredMonths: 2 }, 12: { coveredMonths: 2 } })],
      }),
    });

    expect(within(rowOf('Fixed costs')).getAllByText('based on 2 of 6 months')).toHaveLength(1);
    expect(within(rowOf('Fixed costs')).getByText('based on 2 of 12 months')).toBeInTheDocument();
    expect(within(rowOf('Subscriptions')).queryByText(/based on/)).not.toBeInTheDocument();
  });

  it('shows an em dash, not a zero, where no bill touches a window', () => {
    renderCard({
      trends: makeTrends({
        subscriptions: [
          {
            currency: 'EUR',
            windows: [
              makeWindow(3, { coveredMonths: 0, averageMinor: null, totalMinor: 0 }),
              makeWindow(6, { coveredMonths: 1, averageMinor: 1500, totalMinor: 1500 }),
              makeWindow(12, { coveredMonths: 1, averageMinor: 1500, totalMinor: 1500 }),
            ],
          },
        ],
      }),
    });

    const cells = within(rowOf('Subscriptions')).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('—');
    expect(cells[0]).toHaveTextContent('no bills');
    expect(cells[1]).toHaveTextContent('€15');
    expect(cells[1]).toHaveTextContent('based on 1 of 6 months');
  });

  it('keeps currencies apart under their own headings', () => {
    renderCard({
      trends: makeTrends({
        fixedCosts: [makeWindows('EUR'), makeWindows('ARS', { 3: { averageMinor: 40000000 } })],
        subscriptions: [makeWindows('EUR'), makeWindows('ARS')],
        phases: [],
      }),
    });

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['EUR', 'ARS']);
    const argentine = within(document.querySelector('[data-currency="ARS"]') as HTMLElement);
    expect(within(argentine.getByRole('row', { name: /^Fixed costs/ })).getAllByRole('cell')[0].textContent).toMatch(/ARS\s?400,000/);
  });

  it('explains how the numbers are counted, only when asked', () => {
    renderCard();

    const how = screen.getByText('How these are counted').closest('details') as HTMLDetailsElement;
    expect(how.open).toBe(false);
    expect(how).toHaveTextContent('up to 2026-09');
    expect(how).toHaveTextContent('one-off bills are left out');
  });
});

describe('TrendsCard without bills', () => {
  it('points to logging a bill, and offers to open the phase to do it in', () => {
    const onOpenPhase = vi.fn();
    renderCard({ trends: makeEmptyTrends(), onOpenPhase, openPhaseName: 'Madrid' });

    expect(screen.getByText(/No bills yet\./)).toHaveTextContent('Log a bill');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Madrid' }));
    expect(onOpenPhase).toHaveBeenCalledTimes(1);
  });

  it('offers no button when there is no phase to open', () => {
    renderCard({ trends: makeEmptyTrends() });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('TrendsCard while loading or failing', () => {
  it('says it is loading when there is nothing to show yet', () => {
    renderCard({ status: 'loading', trends: null });

    expect(screen.getByRole('status')).toHaveTextContent('Loading trends…');
  });

  it('keeps the last numbers and offers another try when a refresh fails', () => {
    const { onRetry } = renderCard({ status: 'error', message: 'Could not reach the server.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.');
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
