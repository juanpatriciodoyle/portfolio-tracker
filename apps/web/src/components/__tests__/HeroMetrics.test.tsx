import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import HeroMetrics, { type HeroFigures } from '../HeroMetrics';

const figures: HeroFigures = {
  netWorth: 559342.51,
  realNetWorth: 480000,
  cashBalance: 64500,
  openMarketValue: 494842.51,
  openCostBasis: 340450,
  openProfit: 154392.51,
  realOpenProfit: 100000,
  soldProfit: 44900,
  realSoldProfit: 20000,
  dividends: 0,
  totalFees: 121,
  totalGain: 199171.51,
  totalGainPercent: 70.25,
  pricesAvailable: true,
};

const props = {
  figures,
  period: 'All' as const,
  periodGain: 0,
  periodPercent: 0,
  periodWindow: '1 Jan – 11 Nov 2026',
  currency: 'EUR',
  isRealInflationMode: false,
  country: 'Spain',
};

const card = (title: RegExp | string) => screen.getByRole('group', { name: title });

describe('HeroMetrics: three cards', () => {
  it('shows exactly three cards: Net worth, Open positions gain and Total return', () => {
    render(<HeroMetrics {...props} />);
    expect(screen.getAllByRole('group')).toHaveLength(3);
    expect(screen.queryByText('Fees paid')).not.toBeInTheDocument();
    expect(screen.queryByText(/Gain since you started/)).not.toBeInTheDocument();
  });

  it('Net worth: total, then what is invested and the cash', () => {
    render(<HeroMetrics {...props} />);
    const net = card('Net worth');
    expect(within(net).getByText('€559,342.51')).toBeInTheDocument();
    expect(within(net).getByText('Invested: €494,842.51 · Cash: €64,500.00')).toBeInTheDocument();
  });

  it('Open positions gain: the gain with its percentage, then cost and worth today', () => {
    render(<HeroMetrics {...props} />);
    const open = card('Open positions gain');
    expect(within(open).getByText('+€154,392.51')).toBeInTheDocument();
    expect(within(open).getByText('+45.35%')).toBeInTheDocument();
    expect(within(open).getByText('Cost basis €340,450.00 · Worth €494,842.51 today')).toBeInTheDocument();
  });

  it('Total return on "All": the net total with the sold and open split on one line', () => {
    render(<HeroMetrics {...props} />);
    const total = card('Total return');
    expect(within(total).getByText('+€199,171.51')).toBeInTheDocument();
    expect(within(total).getByText('+70.25%')).toBeInTheDocument();
    expect(within(total).getByText('Sold +€44,900.00 · Open +€154,392.51')).toBeInTheDocument();
  });

  it('keeps dividends and fees in a hover note, not on the card', () => {
    render(<HeroMetrics {...props} figures={{ ...figures, dividends: 100 }} />);
    const split = screen.getByText('Sold +€44,900.00 · Open +€154,392.51');
    expect(split).toHaveAttribute('title', 'Also counted: dividends +€100.00 · fees -€121.00');
  });

  it('names the window and shows its gain for any other period', () => {
    render(<HeroMetrics {...props} period="YTD" periodGain={117670.76} periodPercent={41.51} />);
    const ytd = card('YTD return');
    expect(within(ytd).getByText('+€117,670.76')).toBeInTheDocument();
    expect(within(ytd).getByText('+41.51%')).toBeInTheDocument();
    expect(within(ytd).getByText('1 Jan – 11 Nov 2026')).toBeInTheDocument();
  });

  it('with inflation on, adjusts the open and total figures and says so in the title', () => {
    render(<HeroMetrics {...props} isRealInflationMode figures={{ ...figures, totalGain: 117670.76, totalGainPercent: 41.51 }} />);
    expect(card('Open positions gain · after inflation')).toHaveTextContent('+€100,000.00');
    const total = card('Total return · after inflation');
    expect(total).toHaveTextContent('+€117,670.76');
    expect(total).toHaveTextContent('+41.51%');
    expect(within(total).getByText('Sold +€20,000.00 · Open +€100,000.00')).toBeInTheDocument();
  });

  it('leaves a window as it is when inflation is on, with nothing added to its dates', () => {
    render(<HeroMetrics {...props} period="1Y" periodGain={10} periodPercent={1} isRealInflationMode />);
    expect(within(card('1Y return')).getByText('1 Jan – 11 Nov 2026')).toBeInTheDocument();
    expect(card('1Y return')).not.toHaveTextContent(/before inflation/i);
  });

  it('shows the net worth in today\'s purchasing power when inflation is on, and the nominal one under it', () => {
    render(<HeroMetrics {...props} isRealInflationMode />);
    const net = card('Net worth · after inflation');
    expect(within(net).getByText('€480,000.00')).toBeInTheDocument();
    expect(within(net).getByText('Before inflation: €559,342.51')).toBeInTheDocument();
  });

  it('flags missing live prices on the open positions card', () => {
    render(<HeroMetrics {...props} figures={{ ...figures, pricesAvailable: false }} />);
    expect(within(card('Open positions gain')).getByText('Cost basis €340,450.00 · Live prices unavailable')).toBeInTheDocument();
  });

  it('gives every card the same structure so the figures line up', () => {
    render(<HeroMetrics {...props} />);
    for (const group of screen.getAllByRole('group')) {
      expect(group.querySelectorAll('.hero-card__title')).toHaveLength(1);
      expect(group.querySelectorAll('.hero-card__figure')).toHaveLength(1);
      expect(group.querySelectorAll('.hero-card__subtitle')).toHaveLength(1);
    }
  });
});
