import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FirstTransaction from '../FirstTransaction';

// The form is its own component with its own tests: here it is only a stand-in that can finish.
vi.mock('../TransactionForm', () => ({
  default: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button type="button" onClick={onSuccess}>
      form
    </button>
  ),
}));

const renderIt = (overrides: Partial<React.ComponentProps<typeof FirstTransaction>> = {}) =>
  render(<FirstTransaction open currency="EUR" onSaved={() => undefined} onOpenProfile={() => undefined} onDismiss={() => undefined} onOpen={() => undefined} {...overrides} />);

describe('FirstTransaction: the dialog', () => {
  it('asks for the first transaction in a centred dialog that holds the form', () => {
    renderIt();
    const dialog = screen.getByRole('dialog', { name: 'Add your first transaction' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add your first transaction' })).toBeInTheDocument();
    expect(dialog).toContainElement(screen.getByRole('button', { name: 'form' }));
  });

  it('dims and blurs the page behind it more than other dialogs do, to lower the noise', () => {
    renderIt();
    expect(document.querySelector('.dialog-backdrop')).toHaveClass('dialog-backdrop--calm');
  });

  it('says transaction, never purchase', () => {
    renderIt();
    expect(document.body).not.toHaveTextContent(/purchase/i);
    expect(screen.getByText('Tell us about your first transaction and your total value appears here.')).toBeInTheDocument();
  });

  it('offers the profile as the next step, in one line', () => {
    const open = vi.fn();
    renderIt({ onOpenProfile: open });
    expect(screen.getByText(/to see what your portfolio could cover\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'tell us about yourself' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('says when the transaction was saved', () => {
    const saved = vi.fn();
    renderIt({ onSaved: saved });
    fireEvent.click(screen.getByRole('button', { name: 'form' }));
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed with Esc or its close button', () => {
    const dismiss = vi.fn();
    renderIt({ onDismiss: dismiss });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(dismiss).toHaveBeenCalledTimes(2);
  });
});

describe('FirstTransaction: the quiet empty state behind and after it', () => {
  it('is on the page behind the dialog: nothing to draw yet, so no chart, period buttons or legend', () => {
    renderIt();
    expect(screen.getByRole('heading', { name: 'Nothing here yet' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('is what Home shows once the dialog is dismissed, with one button to reopen it', () => {
    const open = vi.fn();
    renderIt({ open: false, onOpen: open });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
