import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import KpiRow from '../KpiRow';

const base = { netWorth: 25000, cashBalance: 5000, soldProfit: 3500, country: 'Spain' };

describe('KpiRow', () => {
  it('shows net worth with cash, sold profit and the all-time return', () => {
    render(<KpiRow {...base} returnEuros={1200} returnPercent={4.8} isRealInflationMode={false} />);
    expect(screen.getByText('Net worth')).toBeInTheDocument();
    expect(screen.getByText('€25,000.00')).toBeInTheDocument();
    expect(screen.getByText('Cash: €5,000.00')).toBeInTheDocument();
    expect(screen.getByText('Profit from sold assets')).toBeInTheDocument();
    expect(screen.getByText('+€3,500.00')).toBeInTheDocument();
    expect(screen.getByText('All time return')).toBeInTheDocument();
    expect(screen.getByText('+€1,200.00')).toBeInTheDocument();
    expect(screen.getByText('Return: +4.80% (standard)')).toBeInTheDocument();
  });

  it('shows negatives with a minus sign and names the inflation adjustment', () => {
    render(<KpiRow {...base} soldProfit={-50} returnEuros={-10} returnPercent={-0.5} isRealInflationMode />);
    expect(screen.getByText('-€50.00')).toBeInTheDocument();
    expect(screen.getByText('Return: -0.50% (Spain inflation adj.)')).toBeInTheDocument();
  });
});
