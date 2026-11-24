import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Switch from '../Switch';

describe('Switch', () => {
  it('is a real switch with its label as the name, and says whether it is on', () => {
    const { rerender } = render(<Switch checked={false} label="Show profit" onChange={() => undefined} />);
    expect(screen.getByRole('switch', { name: 'Show profit' })).toHaveAttribute('aria-checked', 'false');

    rerender(<Switch checked label="Show profit" onChange={() => undefined} />);
    expect(screen.getByRole('switch', { name: 'Show profit' })).toHaveAttribute('aria-checked', 'true');
  });

  it('asks for the change on a click and on the keyboard', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Show profit" onChange={onChange} />);

    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('carries a hint as its title when it has one', () => {
    render(<Switch checked={false} label="Show profit" hint="Switch between value and profit" onChange={() => undefined} />);
    expect(screen.getByRole('switch')).toHaveAttribute('title', 'Switch between value and profit');
  });
});
