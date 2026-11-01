import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeEntry, makePhase } from '../../../test/fixtures';
import PhaseTimeline from '../PhaseTimeline';

const ok = { ok: true as const, value: undefined };

const madrid = makePhase({ id: 'madrid', name: 'Madrid', startDate: '2022-09-01', endDate: null });
const lisbon = makePhase({ id: 'lisbon', name: 'Lisbon', startDate: '2020-01-01', endDate: '2022-08-31' });
const porto = makePhase({ id: 'porto', name: 'Porto', startDate: '2017-01-01', endDate: '2019-12-31' });
const buenosAires = makePhase({ id: 'ba', name: 'Buenos Aires', startDate: '2027-03-01', endDate: null, currency: 'ARS' });
const lima = makePhase({ id: 'lima', name: 'Lima', startDate: '2028-01-01', endDate: null });

const entries = [
  makeEntry({ phaseId: 'madrid', name: 'Madrid', status: 'current' }),
  makeEntry({ phaseId: 'lisbon', name: 'Lisbon', status: 'past' }),
  makeEntry({ phaseId: 'porto', name: 'Porto', status: 'past' }),
  makeEntry({ phaseId: 'ba', name: 'Buenos Aires', status: 'upcoming' }),
  makeEntry({ phaseId: 'lima', name: 'Lima', status: 'upcoming' }),
];

function renderTimeline(overrides: Partial<React.ComponentProps<typeof PhaseTimeline>> = {}) {
  const props: React.ComponentProps<typeof PhaseTimeline> = {
    phases: [porto, lima, lisbon, madrid, buenosAires],
    entries,
    expandedId: null,
    compareIds: [],
    onToggleExpanded: vi.fn(),
    onToggleCompare: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(ok),
    onUpdatePhase: vi.fn().mockResolvedValue(ok),
    onAddCost: vi.fn().mockResolvedValue(ok),
    onUpdateCost: vi.fn().mockResolvedValue(ok),
    onDeleteCost: vi.fn().mockResolvedValue(ok),
    announce: vi.fn(),
    ...overrides,
  };
  render(<PhaseTimeline {...props} />);
  return props;
}

describe('PhaseTimeline', () => {
  it('shows where you live now first, then what is coming, then where you have been, latest first', () => {
    renderTimeline();

    const names = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

    expect(names).toEqual(['Madrid', 'Buenos Aires', 'Lima', 'Lisbon', 'Porto']);
  });

  it('puts a phase without timeline numbers last rather than hiding it', () => {
    renderTimeline({ phases: [lisbon, madrid], entries: [entries[0]] });

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Madrid', 'Lisbon']);
  });

  it('opens only the expanded card and marks the ones chosen for comparison', () => {
    renderTimeline({ expandedId: 'lisbon', compareIds: ['madrid', 'lisbon'] });

    const cards = screen.getAllByRole('article');
    const byName = (name: string) => cards.find((card) => within(card).queryByRole('heading', { name }) !== null)!;
    expect(within(byName('Lisbon')).getByRole('button', { name: 'Lisbon' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(byName('Madrid')).getByRole('button', { name: 'Madrid' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(byName('Madrid')).getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(byName('Porto')).getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not flag the list as comparing while nothing is chosen', () => {
    renderTimeline();
    expect(screen.getByRole('list', { name: 'Living phases' })).not.toHaveClass('is-comparing');
  });

  it('flags the list while homes are chosen', () => {
    renderTimeline({ compareIds: ['madrid'] });

    expect(screen.getByRole('list', { name: 'Living phases' })).toHaveClass('is-comparing');
  });

  it('tells the page which phase a card belongs to', () => {
    const props = renderTimeline();
    const lisbonCard = screen.getAllByRole('article').find((card) => within(card).queryByRole('heading', { name: 'Lisbon' }))!;

    fireEvent.click(within(lisbonCard).getByRole('button', { name: 'Lisbon' }));
    fireEvent.click(within(lisbonCard).getByRole('button', { name: 'Compare' }));

    expect(props.onToggleExpanded).toHaveBeenCalledWith('lisbon');
    expect(props.onToggleCompare).toHaveBeenCalledWith('lisbon');
  });
});
