import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReportingPeriodBar from '../ReportingPeriodBar';
import PortfolioChart from '../PortfolioChart';
import { type ChartDataPoint, filterDataByPeriod, formatCurrency, formatPercent } from '../../data/sampleChartData';

const reading = (date: string, value: number, cost: number, benchmark: number | null, cashflow = 0): ChartDataPoint => ({
  date_time: `${date}T00:00:00.000Z`,
  portfolio_value_in_reporting_currency: value,
  cumulative_cost_in_reporting_currency: cost,
  cashflow_in_reporting_currency: cashflow,
  benchmark_value_in_reporting_currency: benchmark,
});

// Real readings, one per stretch of time
const testHistoryData: ChartDataPoint[] = [
  reading('2024-01-01', 10000, 10000, 10000, 10000),
  reading('2024-03-01', 11200, 10000, 10500),
  reading('2024-06-01', 12500, 10000, 10800),
  reading('2024-09-01', 14000, 10000, 11200),
];

describe('Chart filter and format utilities', () => {
  it('should filter custom date ranges correctly', () => {
    const { filteredData } = filterDataByPeriod(testHistoryData, 'Custom', { fromDate: '2024-01-01', toDate: '2024-05-01' });
    expect(filteredData.length).toBe(2);
    expect(filteredData[0].date_time).toBe('2024-01-01T00:00:00.000Z');
    expect(filteredData[1].date_time).toBe('2024-03-01T00:00:00.000Z');
  });

  it('reaches back a month, three months, a year or to the start of the year from the last reading', () => {
    const history = [reading('2023-06-01', 1, 1, null), reading('2024-01-01', 1, 1, null), reading('2024-06-01', 1, 1, null), reading('2024-08-01', 1, 1, null), reading('2024-09-01', 1, 1, null)];
    expect(filterDataByPeriod(history, '1M').filteredData.map((p) => p.date_time.slice(0, 7))).toEqual(['2024-08', '2024-09']);
    expect(filterDataByPeriod(history, '3M').filteredData.map((p) => p.date_time.slice(0, 7))).toEqual(['2024-06', '2024-08', '2024-09']);
    expect(filterDataByPeriod(history, '1Y').filteredData.map((p) => p.date_time.slice(0, 7))).toEqual(['2024-01', '2024-06', '2024-08', '2024-09']);
    expect(filterDataByPeriod(history, 'YTD').filteredData[0].date_time.slice(0, 7)).toBe('2024-01');
  });

  it('should format currency correctly', () => {
    expect(formatCurrency(123456.78, 'EUR')).toContain('€123,456.78');
    expect(formatCurrency(500, 'USD')).toContain('$500.00');
    expect(formatCurrency(40, 'GBP')).toBe('£40.00');
  });

  it('writes a loss with its sign first, in one format', () => {
    expect(formatCurrency(-1800, 'EUR')).toBe('-€1,800.00');
    expect(formatCurrency(-88171, 'USD')).toBe('-$88,171.00');
  });

  it('never borrows the sign of another currency: one without a sign of its own is written with its code', () => {
    expect(formatCurrency(4500000, 'ARS')).toBe('ARS 4,500,000.00');
    expect(formatCurrency(-1200, 'CHF')).toBe('-CHF 1,200.00');
  });

  it('should format percentage with plus sign', () => {
    expect(formatPercent(16.91)).toBe('+16.91%');
    expect(formatPercent(-5.2)).toBe('-5.20%');
  });
});

describe('ReportingPeriodBar Component', () => {
  const ALL_WINDOWS = ['All', '1Y', 'YTD', '3M', '1M', 'Custom'] as const;

  it('offers only the windows real readings cover, in plain order', () => {
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={vi.fn()} available={ALL_WINDOWS} />);

    const labels = screen.getAllByRole('button').map((button) => button.textContent?.trim());
    expect(labels).toEqual(['All', '1Y', 'YTD', '3M', '1M', 'Custom']);
  });

  it('leaves out a window the readings do not reach back to', () => {
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={vi.fn()} available={['All', '1M', 'Custom']} />);

    expect(screen.getByText('1M')).toBeInTheDocument();
    expect(screen.queryByText('1Y')).not.toBeInTheDocument();
    expect(screen.queryByText('YTD')).not.toBeInTheDocument();
    expect(screen.queryByText('3M')).not.toBeInTheDocument();
  });

  it('is not shown at all when "All" is the only true window', () => {
    const { container } = render(<ReportingPeriodBar activePeriod="All" onPeriodChange={vi.fn()} available={['All']} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('never offers the trader-style windows that were dropped', () => {
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={vi.fn()} available={ALL_WINDOWS} />);

    for (const gone of ['MTD', '1W', '1D', 'Last year', 'Last month']) expect(screen.queryByText(gone)).not.toBeInTheDocument();
  });

  it('should trigger onPeriodChange when clicking a period button', () => {
    const onPeriodChange = vi.fn();
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={onPeriodChange} available={ALL_WINDOWS} />);

    fireEvent.click(screen.getByText('1Y'));
    expect(onPeriodChange).toHaveBeenCalledWith('1Y');
  });

  it('should open custom date modal and apply valid date range', () => {
    const onPeriodChange = vi.fn();
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={onPeriodChange} available={ALL_WINDOWS} />);

    fireEvent.click(screen.getByText(/Custom/i));
    expect(screen.getByText('Custom Reporting Period')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/From/i), { target: { value: '2024-01-01' } });
    fireEvent.change(screen.getByLabelText(/To/i), { target: { value: '2024-12-31' } });

    fireEvent.click(screen.getByText('Apply Period'));
    expect(onPeriodChange).toHaveBeenCalledWith('Custom', { fromDate: '2024-01-01', toDate: '2024-12-31' });
  });

  it('keeps a custom range inside the days that were really measured', () => {
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={vi.fn()} available={ALL_WINDOWS} realFrom="2024-03-05" />);

    fireEvent.click(screen.getByText(/Custom/i));

    expect(screen.getByLabelText(/From/i)).toHaveAttribute('min', '2024-03-05');
    expect(screen.getByLabelText(/To/i)).toHaveAttribute('min', '2024-03-05');
  });

  it('should show error message if From date is after To date', () => {
    const onPeriodChange = vi.fn();
    render(<ReportingPeriodBar activePeriod="All" onPeriodChange={onPeriodChange} available={ALL_WINDOWS} />);

    fireEvent.click(screen.getByText(/Custom/i));
    fireEvent.change(screen.getByLabelText(/From/i), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText(/To/i), { target: { value: '2024-01-01' } });

    fireEvent.click(screen.getByText('Apply Period'));
    expect(screen.getByText('From date cannot be after to date.')).toBeInTheDocument();
    expect(onPeriodChange).not.toHaveBeenCalled();
  });
});

describe('PortfolioChart Component', () => {
  it('should render its title and controls, and leave the headline figures to the hero', () => {
    render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);

    expect(screen.getByRole('heading', { name: 'Value over time' })).toBeInTheDocument();
    expect(screen.queryByText(/€14,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/since you started/)).not.toBeInTheDocument();

    // Two views, one switch like "Adjust for inflation": off is the value, on is the profit
    expect(screen.getByRole('switch', { name: 'Show profit' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: /^(Value|Profit)$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Performance|Profit\/loss/ })).not.toBeInTheDocument();
  });

  it('holds the period picker in its header row, with the dates the period covers beside it', () => {
    render(<PortfolioChart data={testHistoryData} period="3M" currency="EUR" periodBar={<nav aria-label="Period">chips</nav>} periodNote="Jun 1 to Sep 1, 2024" />);

    const header = screen.getByRole('heading', { name: 'Value over time' }).parentElement as HTMLElement;
    expect(header).toContainElement(screen.getByRole('navigation', { name: 'Period' }));
    expect(header).toContainElement(screen.getByRole('switch', { name: 'Show profit' }));
    expect(screen.getByText('Jun 1 to Sep 1, 2024')).toBeInTheDocument();
  });

  it('does not show a period picker while there is no line to draw', () => {
    render(<PortfolioChart data={[reading('2026-03-10', 1100, 1000, null, 1000)]} period="All" currency="EUR" periodBar={<nav aria-label="Period">chips</nav>} />);

    expect(screen.queryByRole('navigation', { name: 'Period' })).not.toBeInTheDocument();
  });

  it('names its two lines in plain words, as a legend and not as switches', () => {
    render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);

    const legend = screen.getByRole('list', { name: 'Chart lines' });
    expect(legend).toHaveTextContent('Portfolio value');
    expect(legend).toHaveTextContent('The same money in a world index fund');
    expect(legend).not.toHaveTextContent(/Net contributions|Benchmark|MSCI/);
    expect(screen.queryAllByRole('button', { pressed: true }).filter((button) => legend.contains(button))).toHaveLength(0);
  });

  it('should switch between value and profit, and rename the lines to match', () => {
    render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);

    const profit = screen.getByRole('switch', { name: 'Show profit' });
    fireEvent.click(profit);

    expect(profit).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('heading', { name: 'Profit over time' })).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Chart lines' });
    expect(legend).toHaveTextContent('Your profit');
    expect(legend).toHaveTextContent('World index fund profit');
  });

  it('leaves the index line out of the legend when no day had an index price', () => {
    const withoutIndex = testHistoryData.map((point) => ({ ...point, benchmark_value_in_reporting_currency: null }));
    render(<PortfolioChart data={withoutIndex} period="All" currency="EUR" />);

    expect(screen.getByRole('list', { name: 'Chart lines' })).not.toHaveTextContent(/index fund/);
  });
});

describe('PortfolioChart for people who cannot see the picture', () => {
  it('describes the line in one sentence: where it starts and where it ends', () => {
    const { container } = render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);
    const picture = container.querySelector('canvas');

    expect(picture).toHaveAttribute('role', 'img');
    expect(picture?.getAttribute('aria-label')).toMatch(/^Your portfolio value, from .*10,000.* on Jan 1, 2024 to .*14,000.* on Sep 1, 2024\.$/);
  });

  it('follows the chart when it switches to profit', () => {
    const { container } = render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);

    fireEvent.click(screen.getByRole('switch', { name: 'Show profit' }));

    expect(container.querySelector('canvas')?.getAttribute('aria-label')).toMatch(/^Your profit, from .*0.* on Jan 1, 2024 to .*4,000.* on Sep 1, 2024\.$/);
  });

  it('explains the world index line in a plain sentence behind a visible "?"', () => {
    render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);

    fireEvent.click(screen.getByRole('button', { name: /About The same money in a world index fund/ }));

    expect(screen.getByText(/had gone into a world stock index fund instead/)).toBeInTheDocument();
  });
});

describe('PortfolioChart tooltip', () => {
  const plot = { left: 0, top: 0, width: 800, height: 300, right: 800, bottom: 300, x: 0, y: 0, toJSON: () => ({}) };

  function hover(container: HTMLElement, clientX: number, clientY = 120) {
    const wrap = container.querySelector('.portfolio-chart-canvas-wrap') as HTMLElement;
    fireEvent.pointerMove(wrap, { clientX, clientY });
    return wrap;
  }

  it('shows the readings under the pointer, and nothing before it arrives', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(plot);
    const { container } = render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);
    expect(document.querySelector('.portfolio-chart-tooltip')).toBeNull();

    hover(container, 780);

    const tooltip = document.querySelector('.portfolio-chart-tooltip') as HTMLElement;
    expect(tooltip).toHaveTextContent('Sep 1, 2024');
    expect(tooltip).toHaveTextContent('€14,000.00');
    expect(tooltip).toHaveTextContent('€11,200.00');
    vi.restoreAllMocks();
  });

  it('floats above the page, outside the chart, so no border or edge can cut it', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(plot);
    const { container } = render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);

    const wrap = hover(container, 780);

    const tooltip = document.querySelector('.portfolio-chart-tooltip') as HTMLElement;
    expect(wrap).not.toContainElement(tooltip);
    expect(tooltip.parentElement).toBe(document.body);
    vi.restoreAllMocks();
  });

  it('goes away when the pointer leaves', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(plot);
    const { container } = render(<PortfolioChart data={testHistoryData} period="All" currency="EUR" />);
    const wrap = hover(container, 400);

    fireEvent.pointerLeave(wrap);

    expect(document.querySelector('.portfolio-chart-tooltip')).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('PortfolioChart before there is a line to draw', () => {
  it('says the line starts today when there is a single reading, and draws nothing', () => {
    const { container } = render(<PortfolioChart data={[reading('2026-03-10', 1100, 1000, null, 1000)]} period="All" currency="EUR" />);

    expect(screen.getByRole('status')).toHaveTextContent('Your value line starts today');
    expect(screen.getByRole('status')).toHaveTextContent('recorded once a day');
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Show profit' })).not.toBeInTheDocument();
  });

  it('says the same with no reading at all, rather than inventing a flat line', () => {
    const { container } = render(<PortfolioChart data={[]} period="All" currency="EUR" />);

    expect(screen.getByRole('status')).toHaveTextContent('starts today');
    expect(container.querySelector('canvas')).toBeNull();
  });
});
