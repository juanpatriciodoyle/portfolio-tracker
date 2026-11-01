import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfile } from '../../test/fixtures';
import ProfileAvatar from '../ProfileAvatar';

const useProfile = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useProfile', () => ({ useProfile }));

const button = () => screen.getByRole('button', { name: 'Profile and living phases' });

describe('ProfileAvatar', () => {
  beforeEach(() => useProfile.mockReset());

  it('shows the initials of the saved name instead of the generic icon', () => {
    useProfile.mockReturnValue({ status: 'ready', profile: makeProfile({ fullName: 'Juan Patricio Doyle' }) });
    render(<ProfileAvatar onOpen={vi.fn()} />);

    expect(button()).toHaveTextContent('JD');
    expect(button()).toHaveClass('profile-avatar');
  });

  it('keeps the generic icon until a name exists', () => {
    useProfile.mockReturnValue({ status: 'ready', profile: makeProfile({ fullName: null }) });
    render(<ProfileAvatar onOpen={vi.fn()} />);

    expect(button()).toHaveClass('profile-entry-button');
    expect(button()).not.toHaveTextContent(/[A-Z]/);
  });

  it('keeps the generic icon while the profile loads', () => {
    useProfile.mockReturnValue({ status: 'loading', profile: null });
    render(<ProfileAvatar onOpen={vi.fn()} />);

    expect(button()).toHaveClass('profile-entry-button');
  });

  it('opens the profile when pressed', () => {
    useProfile.mockReturnValue({ status: 'ready', profile: makeProfile() });
    const onOpen = vi.fn();
    render(<ProfileAvatar onOpen={onOpen} />);

    fireEvent.click(button());

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
