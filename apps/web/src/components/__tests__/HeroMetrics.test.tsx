import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import HeroMetrics, { type HeroFigures } from '../HeroMetrics';

const figures: HeroFigures = {
  netWorth: 25000,
  cashBalance: 5000,
  openMarketValue: 20500,
  openProfit: 500,
  soldProfit: 4900,
  dividends: 100,
  totalFees: 45,
  totalInvested: 20000,
  totalGain: 5500,
  totalGainPercent: 27.5,
  pricesAvailable: true,
};

const props = { figures, period: 'All' as const, periodGain: 5500, periodPercent: 27.5, currency: 'EUR', isRealInflationMode: false, country: 'Spain' };

describe('HeroMetrics', () => {
  it('puts every headline figure in one section', () => {
    render(<HeroMetrics {...props} />);
    const section = screen.getByRole('region', { name: 'Key figures' });
    for (const label of ['Net worth', 'Still held', 'Total gain or loss', 'Gain since you started', 'Fees paid']) {
      expect(section).toHaveTextContent(label);
    }
  });

  it('keeps sold profit out of its own headline and shows it as a part of the total', () => {
    render(<HeroMetrics {...props} periodGain={5400} />);
    expect(screen.getByText('+€5,500.00', { selector: '.hero-metrics__value' })).toBeInTheDocument();
    expect(screen.getByText(/Sold \+€4,900\.00 · Held \+€500\.00 · Dividends \+€100\.00/)).toBeInTheDocument();
  });

  it('follows the reporting period in the gain tile', () => {
    render(<HeroMetrics {...props} period="Last month" periodGain={-120} periodPercent={-0.5} />);
    expect(screen.getByText('Gain last month')).toBeInTheDocument();
    expect(screen.getByText('-€120.00')).toBeInTheDocument();
    expect(screen.getByText('-0.50%')).toBeInTheDocument();
  });

  it('says so when held assets are shown at cost because prices are missing', () => {
    render(<HeroMetrics {...props} figures={{ ...figures, pricesAvailable: false }} />);
    expect(screen.getByText('Live prices unavailable: shown at what it cost')).toBeInTheDocument();
  });

  it('names the inflation adjustment', () => {
    render(<HeroMetrics {...props} isRealInflationMode />);
    expect(screen.getByText('+27.50% after Spain inflation')).toBeInTheDocument();
  });
});
