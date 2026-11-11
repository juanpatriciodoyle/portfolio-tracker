import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TransactionForm from '../TransactionForm';

describe('TransactionForm Autocomplete & Keyboard Controls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should render Quantity input field allowing decimal values', () => {
    render(<TransactionForm />);

    const quantityInput = screen.getByPlaceholderText(/10.5 or 0.025/i);
    expect(quantityInput).toBeInTheDocument();
    expect(quantityInput).toHaveAttribute('type', 'number');
    expect(quantityInput).toHaveAttribute('step', 'any');
  });

  it('should trigger autocomplete fetch when user types 3+ characters', async () => {
    const mockSearchResults = [
      { symbol: 'VUAA.DE', name: 'Vanguard S&P 500 UCITS ETF', assetClass: 'ETF', sector: 'General Market' },
      { symbol: 'VUAA.L', name: 'Vanguard S&P 500 UCITS ETF USD', assetClass: 'ETF', sector: 'General Market' },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    });

    render(<TransactionForm />);

    const symbolInput = screen.getByPlaceholderText(/SAN.MC, AAPL, NVDA/i);
    fireEvent.change(symbolInput, { target: { value: 'VUA' } });

    await waitFor(() => {
      expect(screen.getByText('VUAA.DE')).toBeInTheDocument();
    });

    expect(screen.getByText('Vanguard S&P 500 UCITS ETF')).toBeInTheDocument();
  });

  it('should select an item from dropdown on click and close dropdown', async () => {
    const mockSearchResults = [
      { symbol: 'SAN.MC', name: 'Banco Santander, S.A.', assetClass: 'Stock', sector: 'Financials' },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    });

    render(<TransactionForm />);

    const symbolInput = screen.getByPlaceholderText(/SAN.MC, AAPL, NVDA/i) as HTMLInputElement;
    fireEvent.change(symbolInput, { target: { value: 'SAN' } });

    await waitFor(() => {
      expect(screen.getByText('SAN.MC')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('SAN.MC'));

    expect(symbolInput.value).toBe('SAN.MC');
    expect(screen.queryByText('Banco Santander, S.A.')).not.toBeInTheDocument();
  });

  it('should navigate dropdown items using ArrowDown and select with Enter key', async () => {
    const mockSearchResults = [
      { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'Stock', sector: 'Technology' },
      { symbol: 'AMZN', name: 'Amazon.com Inc.', assetClass: 'Stock', sector: 'Consumer' },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResults,
    });

    render(<TransactionForm />);

    const symbolInput = screen.getByPlaceholderText(/SAN.MC, AAPL, NVDA/i) as HTMLInputElement;
    fireEvent.change(symbolInput, { target: { value: 'AAP' } });

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Press ArrowDown to highlight second item (AMZN)
    fireEvent.keyDown(symbolInput, { key: 'ArrowDown' });
    // Press Enter to select
    fireEvent.keyDown(symbolInput, { key: 'Enter' });

    expect(symbolInput.value).toBe('AMZN');
  });
});

describe('TransactionForm: the Sold tab only sells what is owned', () => {
  const held = [
    { symbol: 'AAPL', name: 'Apple Inc.', quantity: 10, assetClass: 'Equity', sector: 'Technology', region: 'North America' },
    { symbol: 'VUAA.DE', name: 'Vanguard S&P 500', quantity: 2.5, assetClass: 'ETF', sector: 'Diversified', region: 'Global' },
  ];

  const openSold = (positions = held) => {
    render(<TransactionForm positions={positions} />);
    fireEvent.click(screen.getByRole('button', { name: /Sold/ }));
  };

  const pick = (symbol: string) => {
    fireEvent.focus(screen.getByPlaceholderText('Search what you own'));
    fireEvent.mouseDown(screen.getByRole('option', { name: new RegExp(symbol) }));
  };

  it('replaces the free ticker search with a list of holdings, each with its available units', () => {
    openSold();
    expect(screen.queryByPlaceholderText(/SAN.MC, AAPL, NVDA/i)).not.toBeInTheDocument();
    fireEvent.focus(screen.getByPlaceholderText('Search what you own'));
    expect(screen.getByRole('option', { name: /AAPL.*Available: 10 units/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /VUAA\.DE.*Available: 2\.5 units/ })).toBeInTheDocument();
  });

  it('says nothing can be sold, and cannot be confirmed, with no open positions', () => {
    openSold([]);
    expect(screen.getByText('No open positions available to sell')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('fills and locks asset class, sector and region from the holding', () => {
    openSold();
    pick('VUAA');
    const [assetClass, sector, region] = screen.getAllByRole('combobox').slice(-3) as HTMLSelectElement[];
    expect([assetClass.value, sector.value, region.value]).toEqual(['ETF', 'Diversified', 'Global']);
    for (const select of [assetClass, sector, region]) expect(select).toBeDisabled();
  });

  it('fills the quantity with everything held when MAX is pressed', () => {
    openSold();
    pick('VUAA');
    expect(screen.getByText('Available: 2.5 units')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'MAX' }));
    expect(screen.getByPlaceholderText(/10.5 or 0.025/i)).toHaveValue(2.5);
  });

  it('blocks a quantity above what is held, with a reason', () => {
    openSold();
    pick('AAPL');
    fireEvent.change(screen.getByPlaceholderText(/10.5 or 0.025/i), { target: { value: '11' } });
    fireEvent.change(screen.getByPlaceholderText(/1500.00/), { target: { value: '100' } });
    expect(screen.getByRole('alert')).toHaveTextContent('You only hold 10 units.');
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('allows confirming a valid sale', () => {
    openSold();
    pick('AAPL');
    fireEvent.change(screen.getByPlaceholderText(/10.5 or 0.025/i), { target: { value: '4' } });
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });
});
