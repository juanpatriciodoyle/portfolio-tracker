import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBill, makeEntry, makePhase, noBasis } from '../../../test/fixtures';
import { createMemoryStorage } from '../../../test/memoryStorage';
import type { BillingView } from '../billingView';
import PhaseBills from '../PhaseBills';

const ok = { ok: true as const, value: undefined };

function makeBilling(overrides: Partial<BillingView> = {}): BillingView {
  return {
    asOf: '2026-10-31',
    recordsFor: () => [],
    history: [],
    onAdd: vi.fn().mockResolvedValue(ok),
    onUpdate: vi.fn().mockResolvedValue(ok),
    onDelete: vi.fn().mockResolvedValue(ok),
    ...overrides,
  };
}

function renderBills(overrides: Partial<React.ComponentProps<typeof PhaseBills>> = {}) {
  const props: React.ComponentProps<typeof PhaseBills> = {
    phase: makePhase(),
    entry: makeEntry(),
    billing: makeBilling(),
    open: true,
    onClose: vi.fn(),
    announce: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<PhaseBills {...props} />) };
}

const records = [
  makeBill({ id: 'b1', vendor: 'Iberdrola', periodEnd: '2026-09-14' }),
  makeBill({ id: 'b2', vendor: 'Endesa', category: 'GAS', cadence: 'MONTHLY', periodStart: '2026-09-15', periodEnd: '2026-10-14', amountMinor: 4000 }),
];

const billedEntry = makeEntry({
  fixedCostsByCategoryMinor: { ...makeEntry().fixedCostsByCategoryMinor, ELECTRICITY: 4800, GAS: 4000, INTERNET: 5200 },
  declaredCostsByCategoryMinor: { ...makeEntry().declaredCostsByCategoryMinor, ELECTRICITY: 0, GAS: 0, INTERNET: 4500 },
  monthlyFixedCostsMinor: 154000,
  costBasisByCategory: noBasis({
    RENT: { basis: 'DECLARED', billCount: 0 },
    ELECTRICITY: { basis: 'BILLS', billCount: 1 },
    GAS: { basis: 'BILLS', billCount: 1 },
    INTERNET: { basis: 'BILLS', billCount: 1 },
  }),
});

describe('the costs and bills of a home', () => {
  it('stays closed until it is asked for', () => {
    renderBills({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with what the home costs each month and what that rests on, in plain words', () => {
    renderBills({ entry: billedEntry, billing: makeBilling({ recordsFor: () => records }) });

    const dialog = screen.getByRole('dialog', { name: 'Manage bills and documents' });
    const summary = within(dialog).getByRole('region', { name: 'Fixed costs each month' });
    expect(summary).toHaveTextContent('€1,540');
    expect(summary).toHaveTextContent('Worked out from 2 bills, covering');
    expect(summary).toHaveTextContent('Jul 15, 2026 – Oct 14, 2026');
    expect(summary).toHaveTextContent('Your bills put these costs €7 a month above what you declared.');
  });

  it('says so plainly when there are no bills yet', () => {
    renderBills();
    expect(screen.getByText('No bills yet: these are the rates you declared.')).toBeInTheDocument();
    expect(screen.queryByText(/above what you declared|below what you declared/)).not.toBeInTheDocument();
  });

  it('lists each category with its monthly cost and what it rests on', () => {
    renderBills({ entry: billedEntry, billing: makeBilling({ recordsFor: () => records }) });

    const list = screen.getByRole('list', { name: 'Costs by category' });
    const rent = within(list).getByText('Rent').closest('li') as HTMLElement;
    expect(rent).toHaveTextContent('Declared rate');
    const internet = within(list).getByText('Internet').closest('li') as HTMLElement;
    expect(internet).toHaveTextContent('€52');
    expect(internet).toHaveTextContent('You declared €45');
  });

  it('shows the bills of a category when its row is tapped, newest first, and hides them again', () => {
    renderBills({ entry: billedEntry, billing: makeBilling({ recordsFor: () => records }) });

    expect(screen.queryByRole('list', { name: 'Bills of Gas' })).not.toBeInTheDocument();
    const row = screen.getByRole('button', { name: /Gas/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('list', { name: 'Bills of Gas' })).getByText('Endesa')).toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.queryByRole('list', { name: 'Bills of Gas' })).not.toBeInTheDocument();
  });

  it('keeps a declared-only category as a plain row: there is nothing to open', () => {
    renderBills({ entry: billedEntry, billing: makeBilling({ recordsFor: () => records }) });
    expect(screen.queryByRole('button', { name: /Rent/ })).not.toBeInTheDocument();
  });

  it('corrects a bill from its row', async () => {
    const billing = makeBilling({ recordsFor: () => records });
    const { props } = renderBills({ entry: billedEntry, billing });
    fireEvent.click(screen.getByRole('button', { name: /Electricity/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Electricity bill from Iberdrola' }));
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(billing.onUpdate).toHaveBeenCalledWith('b1', expect.objectContaining({ amountMinor: 9900, vendor: 'Iberdrola' })));
    await waitFor(() => expect(props.announce).toHaveBeenCalledWith('Bill updated'));
  });

  it('removes a bill only after confirming', async () => {
    const billing = makeBilling({ recordsFor: () => records });
    renderBills({ entry: billedEntry, billing });
    fireEvent.click(screen.getByRole('button', { name: /Gas/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Gas bill from Endesa' }));
    expect(billing.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(billing.onDelete).toHaveBeenCalledWith('b2'));
  });

  it('still lists the bills while the monthly picture is on its way back', () => {
    renderBills({ entry: undefined, billing: makeBilling({ recordsFor: () => records }) });
    expect(within(screen.getByRole('list', { name: 'Bills received' })).getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('adding bills from PDFs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    vi.stubGlobal('localStorage', createMemoryStorage({ auth_token: 'tok' }));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const pdf = (name: string) => new File([new Uint8Array(10)], name, { type: 'application/pdf' });

  // The ledger closes when PDFs are picked, so the parent owning `open` is part of the behaviour.
  function Harness() {
    const [open, setOpen] = React.useState(true);
    return <PhaseBills phase={makePhase()} entry={makeEntry()} billing={makeBilling()} open={open} onClose={() => setOpen(false)} announce={vi.fn()} />;
  }

  it('accepts several PDFs picked at once and reviews them one after another', () => {
    render(<Harness />);

    const input = screen.getByLabelText('Choose bill PDFs') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');
    fireEvent.change(input, { target: { files: [pdf('enero.pdf'), pdf('febrero.pdf')] } });

    expect(screen.getByRole('dialog', { name: 'Add bills from PDFs' })).toBeInTheDocument();
    expect(screen.getByText('Bill 1 of 2 · enero.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Manage bills and documents' })).not.toBeInTheDocument();
  });

  it('accepts PDFs dropped onto the drop zone, and ignores other files', () => {
    render(<Harness />);

    const zone = screen.getByText(/Have the PDFs\?/).closest('.pdf-picker') as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [pdf('a.pdf'), new File(['x'], 'photo.png', { type: 'image/png' }), pdf('b.pdf')] } });

    expect(screen.getByText('Bill 1 of 2 · a.pdf')).toBeInTheDocument();
  });

  it('does nothing when only other kinds of file are dropped', () => {
    render(<Harness />);

    const zone = screen.getByText(/Have the PDFs\?/).closest('.pdf-picker') as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } });

    expect(screen.queryByRole('dialog', { name: /from PDFs?|from a PDF/ })).not.toBeInTheDocument();
  });
});
