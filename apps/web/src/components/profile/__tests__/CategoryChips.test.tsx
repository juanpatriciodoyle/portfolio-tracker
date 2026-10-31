import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FIXED_COST_CATEGORIES } from '../../../contracts';
import CategoryChips from '../CategoryChips';

describe('CategoryChips', () => {
  it('offers every category as one choice in a single radio group', () => {
    render(<CategoryChips name="cost" value={null} onChange={vi.fn()} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(FIXED_COST_CATEGORIES.length);
    expect(new Set(radios.map((radio) => radio.getAttribute('name')))).toEqual(new Set(['cost']));
  });

  it('keeps electricity, gas and water together under Utilities', () => {
    render(<CategoryChips name="cost" value={null} onChange={vi.fn()} />);

    const utilities = screen.getByRole('group', { name: 'Utilities' });

    expect(within(utilities).getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'ELECTRICITY',
      'GAS',
      'WATER',
    ]);
  });

  it('marks the chosen category and reports a new choice', () => {
    const onChange = vi.fn();
    render(<CategoryChips name="cost" value="WATER" onChange={onChange} />);

    expect(screen.getByLabelText('Water')).toBeChecked();
    expect(screen.getByLabelText('Rent')).not.toBeChecked();

    fireEvent.click(screen.getByLabelText('Internet'));

    expect(onChange).toHaveBeenCalledWith('INTERNET');
  });

  it('passes the error explanation to assistive technology', () => {
    render(<CategoryChips name="cost" value={null} onChange={vi.fn()} errorId="why" invalid />);

    expect(screen.getByRole('group', { name: 'What is it for?' })).toHaveAttribute('aria-describedby', 'why');
    expect(screen.getAllByRole('radio')[0]).toHaveAttribute('aria-invalid', 'true');
  });
});
