import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { SecondSalaryResponse, TimelineEntryDto } from '../../contracts';
import type { HomeGoals } from '../../hooks/useHomeGoals';
import GoalsStrip from '../GoalsStrip';

vi.mock('../../lib/prefersReducedMotion', () => ({ prefersReducedMotion: () => true }));

const phase = { currency: 'EUR', monthlyIncomeMinor: 320000, savingsCapacityMinor: 221500 } as TimelineEntryDto;
const secondSalary = {
  currency: 'EUR',
  capitalMinor: 46_000_000,
  annualYield: 0.06,
  secondSalaryMinor: 230000,
  reachedMilestone: 3,
  gap: null,
  milestones: [{ id: 3, kind: 'LIVING_COST', monthlyCostMinor: 230000, capitalNeededMinor: 46_000_000, reached: true, progress: 1 }],
  target: null,
} as unknown as SecondSalaryResponse;

const goals = (overrides: Partial<HomeGoals> = {}): HomeGoals => ({ ready: true, phase, secondSalary, ...overrides });

describe('GoalsStrip', () => {
  it('says what you keep and what the portfolio could pay, briefly, and nothing about goals', () => {
    render(<GoalsStrip goals={goals()} onOpenProfile={() => undefined} />);
    const section = screen.getByRole('region', { name: 'Your month' });
    expect(section).toHaveTextContent('You keep about €2,215 a month after fixed costs.');
    expect(section).toHaveTextContent("At 6% a year, your portfolio could pay about €2,300 a month. That's 100% of your monthly living costs.");
    expect(section).not.toHaveTextContent(/goal/i);
  });

  it('draws nothing until it is ready', () => {
    const { container } = render(<GoalsStrip goals={goals({ ready: false })} onOpenProfile={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the profile from the link', () => {
    const open = vi.fn();
    render(<GoalsStrip goals={goals()} onOpenProfile={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'More in your profile' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('is one quiet prompt, with no figure, when there is no home or no income', () => {
    const open = vi.fn();
    render(<GoalsStrip goals={goals({ phase: null })} onOpenProfile={open} />);
    expect(screen.getByText('Add where you live and what you earn to see what your portfolio could cover.')).toBeInTheDocument();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tell us about yourself' }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
