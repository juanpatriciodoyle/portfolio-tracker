import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MutationResult } from '../../../lib/apiErrors';
import { makeProfile } from '../../../test/fixtures';
import ProfileForm from '../ProfileForm';

const ok = { ok: true as const, value: undefined };

function renderForm(profile = makeProfile(), onSave = vi.fn<() => Promise<MutationResult>>().mockResolvedValue(ok)) {
  const announce = vi.fn();
  render(<ProfileForm profile={profile} onSave={onSave} announce={announce} />);
  return { onSave, announce };
}

const show = () => fireEvent.click(screen.getByRole('button', { name: 'Demographics & Household Settings' }));
const edit = () => fireEvent.click(screen.getByRole('button', { name: /Edit|Add details/ }));

describe('ProfileForm summary', () => {
  it('keeps the raw answers out of sight until asked', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Demographics & Household Settings' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Juan Doyle')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();

    show();

    expect(screen.getByRole('button', { name: 'Demographics & Household Settings' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Juan Doyle')).toBeVisible();
  });

  it('shows what is saved', () => {
    renderForm();
    show();

    expect(screen.getByText('Juan Doyle')).toBeInTheDocument();
    expect(screen.getByText('1990')).toBeInTheDocument();
    expect(screen.getByText('🇦🇷 Argentina, 🇪🇸 Spain')).toBeInTheDocument();
    expect(screen.getByText('🇪🇸 Spain')).toBeInTheDocument();
    expect(screen.getByText('1 adult')).toBeInTheDocument();
    expect(screen.getByText('Employed')).toBeInTheDocument();
  });

  it('counts a household with children', () => {
    renderForm(makeProfile({ householdAdults: 2, dependentChildren: 1 }));
    show();
    expect(screen.getByText('2 adults, 1 child')).toBeInTheDocument();
  });

  it('says "Not set" for what is missing', () => {
    renderForm(makeProfile({ taxResidence: null, employmentStatus: null }));
    show();

    expect(screen.getAllByText('Not set')).toHaveLength(2);
  });

  it('invites a first-time visitor to start', () => {
    renderForm(
      makeProfile({ fullName: null, birthYear: null, nationalities: [], taxResidence: null, employmentStatus: null })
    );

    show();

    expect(screen.getByText(/Tell us a little about yourself/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add details' })).toBeInTheDocument();
  });
});

describe('ProfileForm editing', () => {
  it('opens with the saved values and saves a change', async () => {
    const { onSave, announce } = renderForm();

    edit();
    expect(screen.getByLabelText('Full name')).toHaveValue('Juan Doyle');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Juan P. Doyle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...makeProfile(), fullName: 'Juan P. Doyle' }));
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Profile saved'));
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  });

  it('adds and removes nationalities', () => {
    const { onSave } = renderForm(makeProfile({ nationalities: ['AR'] }));
    edit();

    const field = screen.getByLabelText('Nationalities');
    fireEvent.change(field, { target: { value: 'Portugal' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByRole('list', { name: 'Chosen nationalities' })).toHaveTextContent('Portugal');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Argentina' }));
    expect(screen.getByRole('list', { name: 'Chosen nationalities' })).not.toHaveTextContent('Argentina');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('stops at five nationalities', () => {
    renderForm(makeProfile({ nationalities: ['AR', 'ES', 'PT', 'FR', 'IT'] }));
    edit();

    expect(screen.getByLabelText('Nationalities')).toBeDisabled();
  });

  it('steps the household up and down within its limits', async () => {
    const { onSave } = renderForm(makeProfile({ householdAdults: 1, dependentChildren: 0 }));
    edit();

    expect(screen.getByRole('button', { name: 'Decrease adults in household' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease dependent children' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Increase adults in household' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase dependent children' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ householdAdults: 2, dependentChildren: 1 })));
  });

  it('lets someone leave work unanswered', async () => {
    const { onSave } = renderForm();
    edit();

    fireEvent.change(screen.getByLabelText('Work'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ employmentStatus: null })));
  });

  it('rejects a birth year that is not four digits and does not save', () => {
    const { onSave } = renderForm();
    edit();

    fireEvent.change(screen.getByLabelText('Year of birth'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Use a four-digit year such as 1990.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows why a save failed and stays open', async () => {
    const onSave = vi
      .fn<() => Promise<MutationResult>>()
      .mockResolvedValue({ ok: false, failure: { kind: 'network', message: 'Could not reach the server.' } });
    renderForm(makeProfile(), onSave);
    edit();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });

  it('goes back to the summary on Cancel without saving or keeping the edit', () => {
    const { onSave } = renderForm();
    edit();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Someone Else' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Juan Doyle')).not.toBeVisible();
    show();
    expect(screen.getByText('Juan Doyle')).toBeVisible();
  });
});
