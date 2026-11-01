import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeSecondSalary } from '../../test/fixtures';
import SecondSalaryCard from '../SecondSalaryCard';

describe('SecondSalaryCard', () => {
  it('shows the second salary badge and what it covers', () => {
    render(<SecondSalaryCard secondSalary={makeSecondSalary()} />);
    expect(screen.getByRole('heading', { name: 'Second Salary: €1,000 / month' })).toBeInTheDocument();
    expect(screen.getByText('Covers 100% of your rent.')).toBeInTheDocument();
  });

  it('draws the progress toward the target range, readable without sight', () => {
    render(<SecondSalaryCard secondSalary={makeSecondSalary()} />);
    expect(screen.getByRole('img', { name: '€1,000 of the €3,000–€5,000 a month target' })).toBeInTheDocument();
    expect(screen.getByText(/Needs €600,000–€1,000,000 invested/)).toBeInTheDocument();
  });

  it('lists the milestones, marking those reached', () => {
    render(<SecondSalaryCard secondSalary={makeSecondSalary()} />);
    expect(screen.getByText('Utilities & subscriptions')).toHaveClass('is-reached');
    expect(screen.getByText('Rent')).toHaveClass('is-reached');
    expect(screen.getByText('Living costs')).not.toHaveClass('is-reached');
  });

  it('explains why there are no milestones', () => {
    render(<SecondSalaryCard secondSalary={makeSecondSalary({ gap: 'NO_COSTS', milestones: [], reachedMilestone: null })} />);
    expect(screen.getByText('Add your monthly costs to see what your second salary covers.')).toBeInTheDocument();
    expect(screen.queryByText('Rent')).not.toBeInTheDocument();
  });
});
