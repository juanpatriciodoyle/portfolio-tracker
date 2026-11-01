import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutationResult } from '../../../lib/apiErrors';
import { DUPLICATE_BILLING_RECORD, type ExtractionResponse } from '../../../contracts';
import { makePhase } from '../../../test/fixtures';
import { createMemoryStorage } from '../../../test/memoryStorage';
import DocumentReviewModal from '../DocumentReviewModal';

type DocumentReviewModalProps = React.ComponentProps<typeof DocumentReviewModal>;

const madrid = makePhase({ id: 'p1', name: 'Madrid', currency: 'EUR' });
const buenosAires = makePhase({ id: 'p2', name: 'Buenos Aires', currency: 'ARS', startDate: '2020-01-01', endDate: '2022-08-31' });
const phases = [madrid, buenosAires];

const complete: ExtractionResponse = {
  draft: { amountMinor: 9650, currency: 'EUR', vendor: 'Iberdrola', category: 'ELECTRICITY', cadence: 'BIMONTHLY', periodStart: '2026-07-15', periodEnd: '2026-09-14' },
  textFound: true,
  pages: 1,
  suggestedPhaseId: 'p1',
};
const emptyDraft = { amountMinor: null, currency: null, vendor: null, category: null, cadence: null, periodStart: null, periodEnd: null };

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, statusText: '', json: async () => body }) as Response;
const pdf = () => new File([new Uint8Array(50)], 'factura.pdf', { type: 'application/pdf' });
const ok = { ok: true as const, value: undefined };

describe('DocumentReviewModal', () => {
  const fetchMock = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:preview-1');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', createMemoryStorage({ auth_token: 'tok' }));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderModal(response: ExtractionResponse | Response, overrides: { onSave?: DocumentReviewModalProps['onSave']; file?: File; history?: DocumentReviewModalProps['history'] } = {}) {
    fetchMock.mockResolvedValue(response instanceof Object && 'ok' in response ? response : reply(200, response));
    const onSave = vi.fn(overrides.onSave ?? (async () => ok));
    const onClose = vi.fn();
    const file = overrides.file ?? pdf();
    const view = render(
      <DocumentReviewModal files={[file]} phases={phases} today="2026-10-31" history={overrides.history ?? []} openedFromPhaseId="p1" onSave={onSave} onClose={onClose} />
    );
    return { onSave, onClose, file, ...view };
  }

  const unread = (control: HTMLElement) => control.className.includes('is-unread') || control.closest('fieldset')?.className.includes('is-unread') === true;

  it('uploads the raw PDF with its content type and the bearer token, naming the phase it was opened from', async () => {
    const { file } = renderModal(complete);

    await screen.findByRole('form', { name: 'Review the bill' });

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/documents/extract?phaseId=p1');
    expect(init.body).toBe(file);
    expect(init.headers['Content-Type']).toBe('application/pdf');
    expect(init.headers['Authorization']).toBe('Bearer tok');
  });

  it('renders on the page itself, so a collapsed, transparent phase card cannot hide it', async () => {
    fetchMock.mockResolvedValue(reply(200, complete));
    const { container } = render(
      <div data-testid="collapsed-card" style={{ opacity: 0 }}>
        <DocumentReviewModal files={[pdf()]} phases={phases} today="2026-10-31" history={[]} openedFromPhaseId="p1" onSave={vi.fn()} onClose={vi.fn()} />
      </div>
    );

    const dialog = await screen.findByRole('dialog');

    expect(container.contains(dialog)).toBe(false);
    expect(dialog.closest('[data-testid="collapsed-card"]')).toBeNull();
  });

  it('shows a loading state, then prefills what the document said and flags nothing', async () => {
    renderModal(complete);

    expect(screen.getByText('Reading your bill…')).toBeInTheDocument();
    await screen.findByRole('form', { name: 'Review the bill' });

    expect(screen.getByRole('radio', { name: 'Electricity' })).toBeChecked();
    expect(screen.getByLabelText('Who sent it?')).toHaveValue('Iberdrola');
    expect(screen.getByLabelText('Total on the bill')).toHaveValue('96.50');
    expect(screen.getByLabelText('Covers from')).toHaveValue('2026-07-15');
    expect(screen.getByLabelText('Until')).toHaveValue('2026-09-14');
    expect(screen.getByRole('radio', { name: 'Every 2 months' })).toBeChecked();
    expect(document.querySelector('.is-unread')).toBeNull();
  });

  it('preselects the phase the bill belongs to, not the one it was opened from', async () => {
    renderModal({ ...complete, suggestedPhaseId: 'p2', draft: { ...complete.draft, currency: 'ARS' } });

    const select = await screen.findByLabelText('Which home is this bill for?');

    expect(select).toHaveValue('p2');
  });

  it('outlines in yellow each field the document did not say, with no extra text, and keeps it mandatory', async () => {
    const { onSave } = renderModal({ ...complete, draft: { ...emptyDraft, amountMinor: 9650, currency: 'EUR' } });
    await screen.findByRole('form', { name: 'Review the bill' });

    expect(screen.queryByText(/couldn't read this/i)).not.toBeInTheDocument();
    expect(unread(screen.getByLabelText('Who sent it?'))).toBe(true);
    expect(unread(screen.getByLabelText('Covers from'))).toBe(true);
    expect(unread(screen.getByLabelText('Until'))).toBe(true);
    expect(unread(screen.getByRole('radio', { name: 'Electricity' }))).toBe(true);
    expect(unread(screen.getByRole('radio', { name: 'Monthly' }))).toBe(true);
    expect(unread(screen.getByLabelText('Total on the bill'))).toBe(false);
    expect(screen.getByLabelText('Who sent it?')).toHaveValue('');
    expect(screen.getByLabelText('Covers from')).toHaveValue('');
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));

    expect(await screen.findByText('Pick what this bill is for.')).toBeInTheDocument();
    expect(screen.getByText('Who sent this bill?')).toBeInTheDocument();
    expect(screen.getByText('Pick how often this bill comes.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('removes a flag once the person fills the field in', async () => {
    renderModal({ ...complete, draft: { ...complete.draft, vendor: null } });
    await screen.findByRole('form', { name: 'Review the bill' });
    expect(unread(screen.getByLabelText('Who sent it?'))).toBe(true);

    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Endesa' } });

    expect(unread(screen.getByLabelText('Who sent it?'))).toBe(false);
  });

  it('preselects the category from the sender when the document did not say it, and the flag goes with it', async () => {
    renderModal({ ...complete, draft: { ...complete.draft, category: null, vendor: 'Octopus Energy' } }, { history: [{ vendor: 'Octopus', category: 'ELECTRICITY', cadence: 'BIMONTHLY' }] });
    await screen.findByRole('form', { name: 'Review the bill' });

    expect(screen.getByRole('radio', { name: 'Electricity' })).toBeChecked();
    expect(unread(screen.getByRole('radio', { name: 'Electricity' }))).toBe(false);
  });

  it('works out the cadence from the dates the document gave', async () => {
    renderModal({ ...complete, draft: { ...complete.draft, cadence: null, periodStart: '2026-09-01', periodEnd: '2026-09-30' } });
    await screen.findByRole('form', { name: 'Review the bill' });

    expect(screen.getByRole('radio', { name: 'Monthly' })).toBeChecked();
  });

  it('saves the reviewed bill for the chosen phase and closes', async () => {
    const { onSave, onClose } = renderModal(complete);
    await screen.findByRole('form', { name: 'Review the bill' });

    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      phaseId: 'p1',
      category: 'ELECTRICITY',
      cadence: 'BIMONTHLY',
      periodStart: '2026-07-15',
      periodEnd: '2026-09-14',
      amountMinor: 9650,
      vendor: 'Iberdrola',
    });
  });

  it('warns, without converting, when the bill currency differs from the chosen phase', async () => {
    renderModal({ ...complete, draft: { ...complete.draft, currency: 'USD' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('The bill says USD, but Madrid uses EUR. Nothing is converted');
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '100' } });
    expect(screen.getByLabelText('Total on the bill')).toHaveValue('100');
  });

  it('tells the person a scanned PDF has no readable text and offers an empty form', async () => {
    renderModal({ draft: emptyDraft, textFound: false, pages: 1, suggestedPhaseId: null });

    expect(await screen.findByText('This PDF has no readable text (probably a scan). Fill the details in yourself.')).toBeInTheDocument();
    expect(screen.getByLabelText('Who sent it?')).toHaveValue('');
    expect(screen.getByLabelText('Which home is this bill for?')).toHaveValue('p1');
  });

  it.each([
    [415, 'NOT_A_PDF', /not a PDF/],
    [413, 'DOCUMENT_TOO_LARGE', /larger than 5 MB/],
    [422, 'TOO_MANY_PAGES', /more than 15 pages/],
    [422, 'UNREADABLE_DOCUMENT', /could not open/],
    [503, 'EXTRACTION_BUSY', /busy/],
    [429, 'RATE_LIMITED', /several bills in a row/],
  ])('explains a %d %s refusal in plain words and offers to retry', async (status, code, message) => {
    renderModal(reply(status, { error: 'raw server text', code }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/raw server text/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('retries a failed read', async () => {
    renderModal(reply(503, { error: 'busy', code: 'EXTRACTION_BUSY' }));
    await screen.findByRole('button', { name: 'Try again' });
    fetchMock.mockResolvedValue(reply(200, complete));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('form', { name: 'Review the bill' })).toBeInTheDocument();
  });

  it('rejects a wrong file type or an oversized file without sending a request', async () => {
    renderModal(complete, { file: new File(['x'], 'photo.png', { type: 'image/png' }) });

    expect(await screen.findByRole('alert')).toHaveTextContent(/not a PDF/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the modal open and says so when the bill is already recorded, and never saves twice at once', async () => {
    let resolveSave: (value: MutationResult<unknown>) => void = () => undefined;
    const onSave = vi.fn(() => new Promise<MutationResult<unknown>>((resolve) => (resolveSave = resolve)));
    const { onClose } = renderModal(complete, { onSave });
    await screen.findByRole('form', { name: 'Review the bill' });

    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Review the bill' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

    resolveSave({ ok: false, failure: { kind: 'duplicate', message: 'dup', existingRecordId: 'b1' } });

    expect(await screen.findByText(/This bill is already recorded/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Log bill' })).toBeEnabled();
    expect(DUPLICATE_BILLING_RECORD).toBe('DUPLICATE_BILLING_RECORD');
  });

  it('shows a browser-held preview of the file and releases it when closed', async () => {
    const { file, unmount } = renderModal(complete);

    await screen.findByRole('form', { name: 'Review the bill' });
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(screen.getByLabelText('Preview of your PDF')).toHaveAttribute('data', 'blob:preview-1');

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('closes with Escape and from the backdrop, and is announced as a dialog', async () => {
    const { onClose } = renderModal(complete);
    await screen.findByRole('form', { name: 'Review the bill' });

    expect(screen.getByRole('dialog', { name: 'Add a bill from a PDF' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(screen.getByLabelText('Who sent it?'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the dialog and gives it back when it closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = renderModal(complete);
    expect(screen.getByRole('dialog')).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  describe('with several PDFs', () => {
    const many = [new File([new Uint8Array(50)], 'enero.pdf', { type: 'application/pdf' }), new File([new Uint8Array(50)], 'febrero.pdf', { type: 'application/pdf' }), new File([new Uint8Array(50)], 'marzo.pdf', { type: 'application/pdf' })];

    function renderBatch(onSave = vi.fn(async () => ok)) {
      fetchMock.mockImplementation(async () => reply(200, complete));
      const onClose = vi.fn();
      render(<DocumentReviewModal files={many} phases={phases} today="2026-10-31" history={[]} openedFromPhaseId="p1" onSave={onSave} onClose={onClose} />);
      return { onSave, onClose };
    }

    it('reads and reviews one PDF at a time, saying where the person is in the batch', async () => {
      renderBatch();

      await screen.findByRole('form', { name: 'Review the bill' });

      expect(screen.getByRole('dialog', { name: 'Add bills from PDFs' })).toBeInTheDocument();
      expect(screen.getByText('Bill 1 of 3 · enero.pdf')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].body).toBe(many[0]);
    });

    it('logs a bill, then moves on to the next PDF, and closes after the last one', async () => {
      const { onSave, onClose } = renderBatch();
      await screen.findByRole('form', { name: 'Review the bill' });

      fireEvent.click(screen.getByRole('button', { name: 'Log bill and next' }));
      expect(await screen.findByText('Bill 2 of 3 · febrero.pdf')).toBeInTheDocument();
      await screen.findByRole('form', { name: 'Review the bill' });
      expect(fetchMock.mock.calls[1][1].body).toBe(many[1]);
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Log bill and next' }));
      expect(await screen.findByText('Bill 3 of 3 · marzo.pdf')).toBeInTheDocument();
      await screen.findByRole('form', { name: 'Review the bill' });
      fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onSave).toHaveBeenCalledTimes(3);
    });

    it('skips a PDF without logging it', async () => {
      const { onSave } = renderBatch();
      await screen.findByRole('form', { name: 'Review the bill' });

      fireEvent.click(screen.getByRole('button', { name: 'Skip this one' }));

      expect(await screen.findByText('Bill 2 of 3 · febrero.pdf')).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('stops the whole batch from the last button, and keeps what was already logged', async () => {
      const { onSave, onClose } = renderBatch();
      await screen.findByRole('form', { name: 'Review the bill' });
      fireEvent.click(screen.getByRole('button', { name: 'Log bill and next' }));
      await screen.findByText('Bill 2 of 3 · febrero.pdf');
      await screen.findByRole('form', { name: 'Review the bill' });

      fireEvent.click(screen.getByRole('button', { name: 'Stop here' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('offers to skip a PDF that could not be read, and goes on with the rest', async () => {
      fetchMock.mockResolvedValueOnce(reply(422, { error: 'x', code: 'UNREADABLE_DOCUMENT' })).mockResolvedValue(reply(200, complete));
      render(<DocumentReviewModal files={many} phases={phases} today="2026-10-31" history={[]} openedFromPhaseId="p1" onSave={vi.fn()} onClose={vi.fn()} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Skip this one' }));

      expect(await screen.findByText('Bill 2 of 3 · febrero.pdf')).toBeInTheDocument();
      expect(await screen.findByRole('form', { name: 'Review the bill' })).toBeInTheDocument();
    });
  });
});
