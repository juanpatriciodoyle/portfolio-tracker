import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SignOutButton from '../SignOutButton';

describe('SignOutButton', () => {
  it('signs out with one click: nobody is asked twice', () => {
    const onSignOut = vi.fn();
    render(<SignOutButton onSignOut={onSignOut} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign out?')).not.toBeInTheDocument();
  });

  it('has a clear name and a tooltip', () => {
    render(<SignOutButton onSignOut={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Sign out' });
    expect(button).toHaveAttribute('title', 'Sign out');
  });
});
