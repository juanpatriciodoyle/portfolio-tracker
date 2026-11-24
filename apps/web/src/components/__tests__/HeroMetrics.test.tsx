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
  moneyPutIn: 340450,
  openMarketValue: 494842.51,
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
  currency: 'EUR',
  isRealInflationMode: false,
  country: 'Spain',
};

describe('HeroMetrics: one answer to "how am I doing?"', () => {
  it('leads with the total value and says what it is', () => {
    render(<HeroMetrics {...props} />);
    expect(screen.getByText('Total value')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '€559,343' })).toBeInTheDocument();
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
    expect(screen.getByRole('img', { name: '+€199,172' })).toBeInTheDocument();
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

  it('does not repeat the split of the profit on the figure: the fold-out holds it', () => {
    render(<HeroMetrics {...props} />);
    expect(figuresBlock().queryByText('Still held')).not.toBeInTheDocument();
    expect(figuresBlock().queryByText('Already sold')).not.toBeInTheDocument();
  });

  it('writes the story of the profit under the profit, in the fourth row of its figure', () => {
    render(<HeroMetrics {...props} story="Apple and Vanguard made €94,000. Nvidia is down €44,000." />);
    const profit = document.querySelector('.hero__figure--profit')!;
    const story = within(profit as HTMLElement).getByText('Apple and Vanguard made €94,000. Nvidia is down €44,000.');
    expect(story).toHaveClass('hero__story');
    expect(profit.children).toHaveLength(4);
  });

  it('keeps four rows when there is no story, so the baselines of both figures still line up', () => {
    render(<HeroMetrics {...props} />);
    expect(document.querySelector('.hero__figure--profit')!.children).toHaveLength(4);
    expect(document.querySelector('.hero__figure:not(.hero__figure--profit)')!.children).toHaveLength(4);
  });

  it('says what the profit is before and after inflation, with where the rate comes from on hover', () => {
    render(<HeroMetrics {...props} inflation={{ before: 38.4, after: 9.6 }} inflationRate={2.9} />);
    const line = screen.getByText('+38.40% before inflation, +9.60% after inflation');
    expect(line).toHaveAttribute('title', expect.stringContaining('Spain'));
    expect(line).toHaveAttribute('title', expect.stringContaining('2.9%'));
    expect(document.querySelector('.hero__figure--profit')!.children).toHaveLength(4);
  });

  it('with the inflation switch on, does not say the adjusted figure twice: only what it was before', () => {
    render(<HeroMetrics {...props} isRealInflationMode inflation={{ before: 38.4, after: 9.6 }} inflationRate={2.9} />);
    expect(screen.getByText('+38.40% before inflation')).toBeInTheDocument();
    expect(screen.queryByText(/after inflation,/)).not.toBeInTheDocument();
  });

  it('has no inflation line unless it is given one', () => {
    render(<HeroMetrics {...props} />);
    expect(screen.queryByText(/before inflation,/)).not.toBeInTheDocument();
  });

  it('splits the total into the value of the holdings and cash, which add up to it', () => {
    render(<HeroMetrics {...props} />);
    expect(screen.getByText('Holdings value').nextSibling).toHaveTextContent('€494,843');
    expect(screen.getByText('Cash').nextSibling).toHaveTextContent('€64,500');
    expect(screen.queryByText('Invested')).not.toBeInTheDocument();
  });

  it('says what was put in under the total value, so value and contribution are never confused', () => {
    render(<HeroMetrics {...props} />);
    expect(figuresBlock().getByText('Money you put in: €340,450')).toBeInTheDocument();
    expect(screen.queryByText('What you own today')).not.toBeInTheDocument();
  });

  it('shows no percentage before any money was put in, only the words', () => {
    render(<HeroMetrics {...props} figures={{ ...figures, moneyPutIn: 0, totalGain: 120, totalGainPercent: 0 }} />);
    expect(screen.queryByText(/0\.00%/)).not.toBeInTheDocument();
    expect(figuresBlock().getByText(/since you started/)).toBeInTheDocument();
  });

  it('keeps cents under 1,000 and drops them from 1,000 up', () => {
    render(<HeroMetrics {...props} figures={{ ...figures, totalFees: 121.5, totalGain: 950.4 }} />);
    expect(screen.getByRole('img', { name: '+€950.40' })).toBeInTheDocument();
  });

  it('marks a loss as negative', () => {
    render(<HeroMetrics {...props} figures={{ ...figures, totalGain: -1200, totalGainPercent: -3.5 }} />);
    expect(screen.getByRole('img', { name: '-€1,200' }).closest('.hero__figure--profit')).toHaveClass('is-negative');
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
      ['Still held', '+€154,393'],
      ['From sales', '+€44,900'],
      ['Fees', '-€121.00'],
      ['Total profit', '+€199,172'],
    ]);
    expect(panel).toHaveTextContent('It only becomes yours when you sell');
  });

  it('is not offered for a window, whose gain comes from the value history', () => {
    render(<HeroMetrics {...props} period="YTD" periodGain={117670.76} periodPercent={41.51} />);
    expect(screen.queryByRole('button', { name: /how this adds up/i })).not.toBeInTheDocument();
  });
});

describe('HeroMetrics: periods', () => {
  it('shows the gain of the window and names it in words: the dates sit with the picker, above the chart', () => {
    render(<HeroMetrics {...props} period="YTD" periodGain={117670.76} periodPercent={41.51} />);
    expect(screen.getByRole('img', { name: '+€117,671' })).toBeInTheDocument();
    expect(screen.getByText('+41.51%')).toBeInTheDocument();
    expect(screen.getByText(/this year/)).toBeInTheDocument();
    expect(screen.queryByText(/1 Jan/)).not.toBeInTheDocument();
  });

  it('holds no period picker: it belongs to the chart it filters', () => {
    render(<HeroMetrics {...props} />);
    expect(document.querySelector('.hero__controls')).toBeNull();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('HeroMetrics: inflation', () => {
  it('shows the total in today\'s purchasing power and the nominal one under it', () => {
    render(<HeroMetrics {...props} isRealInflationMode figures={{ ...figures, totalGain: 117670.76, totalGainPercent: 41.51 }} />);
    expect(screen.getByText('Total value, after inflation')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '€480,000' })).toBeInTheDocument();
    expect(screen.getByText('Before inflation: €559,343')).toBeInTheDocument();
    expect(screen.getByText(/since you started, after inflation/)).toBeInTheDocument();
  });

  it('drops the holdings and cash split, which would not add up to the adjusted total', () => {
    render(<HeroMetrics {...props} isRealInflationMode />);
    expect(screen.queryByText('Holdings value')).not.toBeInTheDocument();
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
});
