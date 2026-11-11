import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CapitalMilestoneEditor from '../CapitalMilestoneEditor';
import { formForPreset } from '../capitalMilestoneForm';

const ok = { ok: true as const, value: undefined };
const renderEditor = (onDelete?: () => Promise<typeof ok>) =>
  render(<CapitalMilestoneEditor initial={formForPreset('CUSTOM')} id="m1" currency="EUR" onSave={vi.fn().mockResolvedValue(ok)} onDelete={onDelete} onClose={vi.fn()} />);

describe('CapitalMilestoneEditor layout', () => {
  it('ends in one footer with Cancel and Save milestone, in that order', () => {
    renderEditor();
    const footer = document.querySelector('.milestone-editor__footer') as HTMLElement;
    expect(within(footer).getAllByRole('button').map((button) => button.textContent)).toEqual(['Cancel', 'Save milestone']);
  });

  it('keeps Delete out of the footer, as a quiet link above it', () => {
    renderEditor(vi.fn().mockResolvedValue(ok));
    const footer = document.querySelector('.milestone-editor__footer') as HTMLElement;
    const remove = screen.getByRole('button', { name: 'Delete milestone' });
    expect(footer).not.toContainElement(remove);
    expect(remove.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('asks before deleting', () => {
    renderEditor(vi.fn().mockResolvedValue(ok));
    fireEvent.click(screen.getByRole('button', { name: 'Delete milestone' }));
    expect(screen.getByRole('group', { name: 'Confirm delete' })).toBeInTheDocument();
  });
});
