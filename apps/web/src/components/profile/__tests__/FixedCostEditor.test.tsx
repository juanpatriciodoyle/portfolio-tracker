import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCost } from '../../../test/fixtures';
import FixedCostEditor from '../FixedCostEditor';

const ok = { ok: true as const, value: undefined };

const renderEditor = (props: Partial<React.ComponentProps<typeof FixedCostEditor>> = {}) => {
  const onSubmit = vi.fn().mockResolvedValue(ok);
  render(<FixedCostEditor currency="EUR" onSubmit={onSubmit} onCancel={vi.fn()} {...props} />);
  return { onSubmit };
};

describe('FixedCostEditor', () => {
  it('uses a neutral placeholder for the provider', () => {
    renderEditor();
    expect(screen.getByLabelText('Label (optional)')).toHaveAttribute('placeholder', 'Company / Provider');
  });

  it('offers a bill every 6 months and saves it', async () => {
    const { onSubmit } = renderEditor();

    fireEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Every 6 months' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cadence: 'SEMI_ANNUALLY', amountMinor: 60000 })));
  });

  it('accepts only numbers in the amount', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '4x8.5y0' } });

    expect(screen.getByLabelText('Amount each time')).toHaveValue('48.50');
  });

  it('lets a label be a name with digits', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'O2' } });

    expect(screen.getByLabelText('Label (optional)')).toHaveValue('O2');
  });

  it('saves an optional end date, and clears it when it is emptied', async () => {
    const { onSubmit } = renderEditor({ initial: makeCost({ category: 'SUBSCRIPTIONS', label: 'Netflix', endDate: '2026-03-31' }) });
    expect(screen.getByLabelText('Ends on (optional)')).toHaveValue('2026-03-31');

    fireEvent.change(screen.getByLabelText('Ends on (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ endDate: null })));
  });

  it('sends no end date for a cost that never ends', async () => {
    const { onSubmit } = renderEditor();

    fireEvent.click(screen.getByRole('radio', { name: 'Rent' }));
    fireEvent.change(screen.getByLabelText('Amount each time'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add cost' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].endDate ?? null).toBeNull();
  });
});
