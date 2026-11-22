import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HeroMetrics, { type HeroFigures } from '../HeroMetrics';

// The figures count up in the browser; here they are simply their final value.
vi.mock('../../lib/prefersReducedMotion', () => ({ prefersReducedMotion: () => true }));

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

/** The two headline figures only: the folded breakdown repeats some of their words. */
const figuresBlock = () => within(document.querySelector<HTMLElement>('.hero__figures')!);

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

describe('HeroMetrics: one answer to "how am I doing?"', () => {
  it('leads with the total value and says what it is', () => {
    render(<HeroMetrics {...props} />);
    expect(screen.getByText('Total value')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '€559,342.51' })).toBeInTheDocument();
  });

  it('has no more than one big figure and one gain: the three-card layout is gone', () => {
    render(<HeroMetrics {...props} />);
    expect(screen.queryByText('Open positions gain')).not.toBeInTheDocument();
    expect(screen.queryByText('Total return')).not.toBeInTheDocument();
    expect(screen.queryByText('Net worth')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('group')).toHaveLength(0);
  });

  it('says what it has earned, with the percentage and the period in plain words', () => {
    render(<HeroMetrics {...props} />);
    expect(figuresBlock().getByText('Total profit')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '+€199,171.51' })).toBeInTheDocument();
    expect(screen.getByText('+70.25%')).toBeInTheDocument();
    expect(screen.getByText(/since you started/)).toBeInTheDocument();
  });

  it('puts the profit beside the total value, as the second of two figures at the same level', () => {
    render(<HeroMetrics {...props} />);
    const figures = document.querySelectorAll('.hero__figures > .hero__figure');
    expect(figures).toHaveLength(2);
    expect(figures[0]).toHaveTextContent('Total value');
    expect(figures[1]).toHaveTextContent('Total profit');
  });

  it('shows without opening anything what the holdings have gained now and what selling already made', () => {
    render(<HeroMetrics {...props} />);
    expect(figuresBlock().getByText('Still invested').nextSibling).toHaveTextContent('+€154,392.51');
    expect(figuresBlock().getByText('Already sold').nextSibling).toHaveTextContent('+€44,900.00');
  });

  it('says "None yet" when nothing was sold, instead of a zero that looks like a result', () => {
    render(<HeroMetrics {...props} figures={{ ...figures, soldProfit: 0, totalGain: 154271.51 }} />);
    expect(figuresBlock().getByText('Already sold').nextSibling).toHaveTextContent('None yet');
  });

  it('with inflation on, shows the adjusted parts', () => {
    render(<HeroMetrics {...props} isRealInflationMode />);
    expect(figuresBlock().getByText('Still invested').nextSibling).toHaveTextContent('+€100,000.00');
    expect(figuresBlock().getByText('Already sold').nextSibling).toHaveTextContent('+€20,000.00');
  });

  it('shows no split for a window', () => {
    render(<HeroMetrics {...props} period="YTD" periodGain={10} periodPercent={1} />);
    expect(screen.queryByText('Still invested')).not.toBeInTheDocument();
    expect(screen.queryByText('Already sold')).not.toBeInTheDocument();
  });

  it('splits the total into what is invested and what is cash', () => {
    render(<HeroMetrics {...props} />);
    expect(screen.getByText('Invested').nextSibling).toHaveTextContent('€494,842.51');
    expect(screen.getByText('Cash').nextSibling).toHaveTextContent('€64,500.00');
  });

  it('marks a loss as negative', () => {
    render(<HeroMetrics {...props} figures={{ ...figures, totalGain: -1200, totalGainPercent: -3.5 }} />);
    expect(screen.getByRole('img', { name: '-€1,200.00' }).closest('.hero__figure--profit')).toHaveClass('is-negative');
    expect(screen.getByText('-3.50%')).toBeInTheDocument();
  });
});

describe('HeroMetrics: how this adds up', () => {
  it('starts folded and hidden from the keyboard', () => {
    render(<HeroMetrics {...props} />);
    const toggle = screen.getByRole('button', { name: /how this adds up/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveAttribute('inert');
  });

  it('opens to the parts of the gain, each with its meaning, adding up to the total', () => {
    render(<HeroMetrics {...props} />);
    const toggle = screen.getByRole('button', { name: /how this adds up/i });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(panel).not.toHaveAttribute('inert');
    const rows = Array.from(panel.querySelectorAll('li')).map((row) => [
      row.querySelector('.hero__part-name')!.firstChild!.textContent,
      row.querySelector('.hero__part-amount')!.textContent,
    ]);
    expect(rows).toEqual([
      ['Still invested', '+€154,392.51'],
      ['Sold', '+€44,900.00'],
      ['Fees', '-€121.00'],
      ['Total profit', '+€199,171.51'],
    ]);
    expect(panel).toHaveTextContent('It only becomes yours when you sell');
  });

  it('is not offered for a window, whose gain comes from the value history', () => {
    render(<HeroMetrics {...props} period="YTD" periodGain={117670.76} periodPercent={41.51} />);
    expect(screen.queryByRole('button', { name: /how this adds up/i })).not.toBeInTheDocument();
  });
});

describe('HeroMetrics: periods', () => {
  it('shows the gain of the window, names it in words and shows its dates', () => {
    render(<HeroMetrics {...props} period="YTD" periodGain={117670.76} periodPercent={41.51} />);
    expect(screen.getByRole('img', { name: '+€117,670.76' })).toBeInTheDocument();
    expect(screen.getByText('+41.51%')).toBeInTheDocument();
    expect(screen.getByText(/this year/)).toBeInTheDocument();
    expect(screen.getByText('1 Jan – 11 Nov 2026')).toBeInTheDocument();
  });

  it('does not repeat the dates when the period is everything', () => {
    render(<HeroMetrics {...props} />);
    expect(screen.queryByText('1 Jan – 11 Nov 2026')).not.toBeInTheDocument();
  });
});

describe('HeroMetrics: inflation', () => {
  it('shows the total in today\'s purchasing power and the nominal one under it', () => {
    render(<HeroMetrics {...props} isRealInflationMode figures={{ ...figures, totalGain: 117670.76, totalGainPercent: 41.51 }} />);
    expect(screen.getByText('Total value, after inflation')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '€480,000.00' })).toBeInTheDocument();
    expect(screen.getByText('Before inflation: €559,342.51')).toBeInTheDocument();
    expect(screen.getByText(/since you started, after inflation/)).toBeInTheDocument();
  });

  it('drops the invested and cash split, which would not add up to the adjusted total', () => {
    render(<HeroMetrics {...props} isRealInflationMode />);
    expect(screen.queryByText('Invested')).not.toBeInTheDocument();
    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
  });

  it('leaves a window as it is, with nothing about inflation added', () => {
    render(<HeroMetrics {...props} period="1Y" periodGain={10} periodPercent={1} isRealInflationMode />);
    expect(screen.getByText(/in the past year/)).toBeInTheDocument();
  });
});

describe('HeroMetrics: states', () => {
  it('says so when live prices are missing', () => {
    render(<HeroMetrics {...props} figures={{ ...figures, pricesAvailable: false }} />);
    expect(screen.getByText(/live prices are unavailable/i)).toBeInTheDocument();
  });

  it('holds its place while the first answer is on its way', () => {
    render(<HeroMetrics {...props} loading />);
    expect(screen.getByRole('region', { name: 'Your portfolio' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('invites a first transaction on an empty account instead of showing zeros as results', () => {
    const empty = { ...figures, netWorth: 0, realNetWorth: 0, cashBalance: 0, openMarketValue: 0, openCostBasis: 0, totalGain: 0, totalGainPercent: 0, openProfit: 0, soldProfit: 0, totalFees: 0 };
    render(<HeroMetrics {...props} figures={empty} />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.queryByText(/since you started/)).not.toBeInTheDocument();
  });

  it('puts the period picker under the figures it changes', () => {
    render(
      <HeroMetrics {...props}>
        <nav aria-label="Reporting period" />
      </HeroMetrics>,
    );
    expect(screen.getByRole('navigation', { name: 'Reporting period' })).toBeInTheDocument();
  });
});
