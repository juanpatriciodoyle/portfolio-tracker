import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProfileTabs from '../ProfileTabs';
import { readProfileTab, storeProfileTab } from '../../../lib/profileTab';

describe('ProfileTabs', () => {
  it('shows both tabs, marking the open one', () => {
    render(<ProfileTabs active="living" onChange={vi.fn()} />);
    expect(screen.getByRole('tablist', { name: 'Profile sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Living Costs & Career' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Milestones & Positioning' })).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps only the open tab in the Tab order', () => {
    render(<ProfileTabs active="living" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Living Costs & Career' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Milestones & Positioning' })).toHaveAttribute('tabindex', '-1');
  });

  it('opens a tab on click', () => {
    const onChange = vi.fn();
    render(<ProfileTabs active="living" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Milestones & Positioning' }));
    expect(onChange).toHaveBeenCalledWith('milestones');
  });

  it.each([
    ['living', 'ArrowRight', 'milestones'],
    ['milestones', 'ArrowRight', 'living'],
    ['living', 'ArrowLeft', 'milestones'],
    ['milestones', 'Home', 'living'],
    ['living', 'End', 'milestones'],
  ] as const)('from %s, %s opens %s', (active, key, expected) => {
    const onChange = vi.fn();
    render(<ProfileTabs active={active} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key });
    expect(onChange).toHaveBeenCalledWith(expected);
  });
});

describe('the remembered tab', () => {
  const storage = (value: string | null) => ({ getItem: () => value });

  it('opens on the first tab by default', () => {
    expect(readProfileTab(storage(null))).toBe('living');
  });

  it('opens on the one left open', () => {
    expect(readProfileTab(storage('milestones'))).toBe('milestones');
  });

  it('ignores a value it does not know', () => {
    expect(readProfileTab(storage('nonsense'))).toBe('living');
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readProfileTab(broken)).toBe('living');
    expect(() => storeProfileTab('milestones', broken)).not.toThrow();
  });
});
