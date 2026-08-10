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

    global.fetch = vi.fn().mockResolvedValue({
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

    global.fetch = vi.fn().mockResolvedValue({
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

    global.fetch = vi.fn().mockResolvedValue({
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
