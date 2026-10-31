import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PhaseComparisonResponse } from '../../../contracts';
import PhaseComparison from '../PhaseComparison';

const comparable: PhaseComparisonResponse = {
  comparable: true,
  fromPhaseId: 'a',
  toPhaseId: 'b',
  currency: 'EUR',
  monthlyIncomeDeltaMinor: 0,
  monthlyFixedCostsDeltaMinor: 25000,
  savingsCapacityDeltaMinor: -25000,
  fixedCostsDeltaFraction: 0.1,
  categories: [
    { category: 'RENT', fromMinor: 100000, toMinor: 120000, deltaMinor: 20000 },
    { category: 'WATER', fromMinor: 4000, toMinor: 3000, deltaMinor: -1000 },
  ],
};

describe('PhaseComparison', () => {
  it('shows nothing until two phases are chosen', () => {
    const { container } = render(<PhaseComparison fromName="Madrid" toName="Lisbon" state={{ status: 'idle' }} onClose={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('says it is working while the numbers load', () => {
    render(<PhaseComparison fromName="Madrid" toName="Lisbon" state={{ status: 'loading' }} onClose={vi.fn()} />);

    expect(screen.getByText('Comparing…')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Comparison of Madrid and Lisbon' })).toHaveAttribute('aria-busy', 'true');
  });

  it('puts the answer in a sentence, then the categories behind it', () => {
    render(<PhaseComparison fromName="Madrid" toName="Lisbon" state={{ status: 'ready', comparison: comparable }} onClose={vi.fn()} />);

    expect(screen.getByText('Fixed costs in Lisbon are €250 more per month than in Madrid (10%).')).toBeInTheDocument();
    expect(screen.getByText("You'd have €250 less left over each month.")).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Rent: €1,000 → €1,200 (+€200)',
      'Water: €40 → €30 (-€10)',
    ]);
  });

  it('explains kindly why two currencies cannot be compared yet', () => {
    render(
      <PhaseComparison
        fromName="Madrid"
        toName="Buenos Aires"
        state={{ status: 'ready', comparison: { comparable: false, reason: 'FX_REQUIRED', currencies: ['EUR', 'ARS'] } }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/different currencies \(EUR and ARS\)/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('says amounts were converted, and labels the official Argentine rate as official', () => {
    const converted: PhaseComparisonResponse = {
      ...comparable,
      currency: 'ARS',
      categories: [],
      rateSources: [{ currency: 'ARS', source: 'BCRA_OFFICIAL' }],
    };
    render(<PhaseComparison fromName="Madrid" toName="Buenos Aires" state={{ status: 'ready', comparison: converted }} onClose={vi.fn()} />);

    expect(screen.getByText(/Amounts shown in ARS, converted at the official rate\./)).toBeInTheDocument();
    expect(screen.getByText('ARS · Official rate')).toBeInTheDocument();
  });

  it('adds no conversion note when nothing was converted', () => {
    render(<PhaseComparison fromName="Madrid" toName="Lisbon" state={{ status: 'ready', comparison: comparable }} onClose={vi.fn()} />);

    expect(screen.queryByText(/converted at/)).not.toBeInTheDocument();
  });

  it('shows what went wrong', () => {
    render(<PhaseComparison fromName="Madrid" toName="Lisbon" state={{ status: 'error', message: 'Could not reach the server.' }} onClose={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.');
  });

  it('can be dismissed', () => {
    const onClose = vi.fn();
    render(<PhaseComparison fromName="Madrid" toName="Lisbon" state={{ status: 'ready', comparison: comparable }} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
