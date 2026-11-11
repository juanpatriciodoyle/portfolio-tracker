import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionResponse } from '../../../contracts';
import { makePhase } from '../../../test/fixtures';
import { createMemoryStorage } from '../../../test/memoryStorage';
import type { MutationResult } from '../../../lib/apiErrors';
import ExpenseWizard from '../ExpenseWizard';

type Props = React.ComponentProps<typeof ExpenseWizard>;

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
const pdf = (name = 'factura.pdf') => new File([new Uint8Array(50)], name, { type: 'application/pdf' });
const ok = { ok: true as const, value: undefined };
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
const unread = (control: HTMLElement) => control.className.includes('is-unread') || control.closest('fieldset')?.className.includes('is-unread') === true;

describe('adding bills from PDFs', () => {
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

  function renderPdf(response: ExtractionResponse | Response, overrides: Partial<Props> & { files?: File[] } = {}) {
    fetchMock.mockResolvedValue('ok' in response ? response : reply(200, response));
    const props: Props = {
      phases,
      context: { today: '2026-10-31', countryCode: 'ES', history: [] },
      openedFromPhaseId: 'p1',
      initialFiles: overrides.files ?? [pdf()],
      onSubmitReceipt: vi.fn(async () => ok),
      onSubmitRate: vi.fn(async () => ok),
      onClose: vi.fn(),
      ...overrides,
    };
    const view = render(<ExpenseWizard {...props} />);
    return { props, ...view };
  }

  it('uploads the raw PDF with its content type and the bearer token, naming the home it was opened from', async () => {
    const files = [pdf()];
    renderPdf(complete, { files });

    await screen.findByLabelText('Who sent it?');

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/documents/extract?phaseId=p1');
    expect(init.body).toBe(files[0]);
    expect(init.headers['Content-Type']).toBe('application/pdf');
    expect(init.headers['Authorization']).toBe('Bearer tok');
  });

  it('reads the PDF, then asks the same questions with what it said already filled in, and nothing flagged', async () => {
    renderPdf(complete);
    expect(screen.getByText('Reading your bill…')).toBeInTheDocument();

    expect(await screen.findByLabelText('Who sent it?')).toHaveValue('Iberdrola');
    expect(screen.getByRole('radio', { name: 'Electricity' })).toBeChecked();
    next();
    expect(screen.getByLabelText('Total on the bill')).toHaveValue('96.50');
    expect(screen.getByRole('radio', { name: 'Every 2 months' })).toBeChecked();
    next();
    expect(screen.getByLabelText('Covers from')).toHaveValue('2026-07-15');
    expect(screen.getByLabelText('Until')).toHaveValue('2026-09-14');
    expect(document.querySelector('.is-unread')).toBeNull();
  });

  it('shows the PDF beside the questions, and releases its copy when closed', async () => {
    const files = [pdf()];
    const { unmount } = renderPdf(complete, { files });

    await screen.findByLabelText('Who sent it?');
    expect(createObjectURL).toHaveBeenCalledWith(files[0]);
    expect(screen.getByLabelText('Preview of your PDF')).toHaveAttribute('data', 'blob:preview-1');

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('preselects the home the bill belongs to, not the one it was opened from', async () => {
    renderPdf({ ...complete, suggestedPhaseId: 'p2', draft: { ...complete.draft, currency: 'ARS' } });

    expect(await screen.findByLabelText('Which home is this bill for?')).toHaveValue('p2');
  });

  it('logs a bill as a receipt, whatever its category, and closes after the last PDF', async () => {
    const { props } = renderPdf({ ...complete, draft: { ...complete.draft, vendor: 'Landlord', category: 'RENT', cadence: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-09-30' } });
    await screen.findByLabelText('Who sent it?');
    next();
    next();

    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(props.onSubmitRate).not.toHaveBeenCalled();
    expect(props.onSubmitReceipt).toHaveBeenCalledWith({
      phaseId: 'p1',
      category: 'RENT',
      cadence: 'MONTHLY',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      amountMinor: 9650,
      vendor: 'Landlord',
    });
  });

  it('outlines in yellow each thing the document did not say, with no extra text, and keeps it mandatory', async () => {
    const { props } = renderPdf({ ...complete, draft: { ...emptyDraft, amountMinor: 9650, currency: 'EUR' } });
    const vendor = await screen.findByLabelText('Who sent it?');

    expect(unread(vendor)).toBe(true);
    expect(unread(screen.getByRole('radio', { name: 'Electricity' }))).toBe(true);
    expect(screen.getByRole('radio', { name: 'Electricity' })).not.toBeChecked();
    expect(screen.queryByText(/couldn't read this/i)).not.toBeInTheDocument();

    next();
    expect(screen.getByText('Pick what this is for.')).toBeInTheDocument();
    expect(props.onSubmitReceipt).not.toHaveBeenCalled();

    fireEvent.change(vendor, { target: { value: 'Endesa' } });
    expect(unread(vendor)).toBe(false);
  });

  it('works out how often it comes from the days the document gave', async () => {
    renderPdf({ ...complete, draft: { ...complete.draft, cadence: null, periodStart: '2026-09-01', periodEnd: '2026-09-30' } });
    await screen.findByLabelText('Who sent it?');
    next();

    expect(screen.getByRole('radio', { name: 'Every month' })).toBeChecked();
  });

  it('warns, without converting, when the bill currency differs from the home', async () => {
    renderPdf({ ...complete, draft: { ...complete.draft, currency: 'USD' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('The bill says USD, but Madrid uses EUR. Nothing is converted');
  });

  it('tells the person a scanned PDF has no readable text and offers an empty form', async () => {
    renderPdf({ draft: emptyDraft, textFound: false, pages: 1, suggestedPhaseId: null });

    expect(await screen.findByText('This PDF has no readable text (probably a scan). Fill the details in yourself.')).toBeInTheDocument();
    expect(screen.getByLabelText('Who sent it?')).toHaveValue('');
  });

  it.each([
    [415, 'NOT_A_PDF', /not a PDF/],
    [413, 'DOCUMENT_TOO_LARGE', /larger than 5 MB/],
    [422, 'TOO_MANY_PAGES', /more than 15 pages/],
    [422, 'UNREADABLE_DOCUMENT', /could not open/],
    [503, 'EXTRACTION_BUSY', /busy/],
    [429, 'RATE_LIMITED', /several bills in a row/],
  ])('explains a %d %s refusal in plain words and offers to retry', async (status, code, message) => {
    renderPdf(reply(status, { error: 'raw server text', code }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/raw server text/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThanOrEqual(1);
  });

  it('retries a failed read', async () => {
    renderPdf(reply(503, { error: 'busy', code: 'EXTRACTION_BUSY' }));
    await screen.findByRole('button', { name: 'Try again' });
    fetchMock.mockResolvedValue(reply(200, complete));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText('Who sent it?')).toBeInTheDocument();
  });

  it('rejects a wrong file type without sending a request', async () => {
    renderPdf(complete, { files: [new File(['x'], 'photo.png', { type: 'image/png' })] });

    expect(await screen.findByRole('alert')).toHaveTextContent(/not a PDF/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and says so when the bill is already recorded, and never saves twice at once', async () => {
    let resolveSave: (value: MutationResult<unknown>) => void = () => undefined;
    const onSubmitReceipt = vi.fn(() => new Promise<MutationResult<unknown>>((resolve) => (resolveSave = resolve)));
    const { props } = renderPdf(complete, { onSubmitReceipt });
    await screen.findByLabelText('Who sent it?');
    next();
    next();

    fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(onSubmitReceipt).toHaveBeenCalledTimes(1);

    resolveSave({ ok: false, failure: { kind: 'duplicate', message: 'dup', existingRecordId: 'b1' } });

    expect(await screen.findByText(/This bill is already recorded/)).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Log bill' })).toBeEnabled();
  });

  it('closes with Escape and is announced as a dialog', async () => {
    const { props } = renderPdf(complete);
    await screen.findByLabelText('Who sent it?');

    expect(screen.getByRole('dialog', { name: 'Add a bill from a PDF' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(screen.getByLabelText('Who sent it?'), { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  describe('with several PDFs', () => {
    const many = () => [pdf('enero.pdf'), pdf('febrero.pdf'), pdf('marzo.pdf')];
    const progress = (text: string) => screen.findByRole('dialog', { name: new RegExp(text) });
    const logBill = async () => {
      await screen.findByLabelText('Who sent it?');
      next();
      next();
      fireEvent.click(screen.getByRole('button', { name: 'Log bill' }));
    };

    it('reads and walks through one PDF at a time, saying where the person is in the batch', async () => {
      const files = many();
      renderPdf(complete, { files });

      expect(await progress('Add bills from PDFs · Bill 1 of 3 · enero.pdf')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].body).toBe(files[0]);
    });

    it('logs a bill, then moves on to the next PDF, and closes after the last one', async () => {
      const files = many();
      const { props } = renderPdf(complete, { files });

      await logBill();
      expect(await progress('Bill 2 of 3 · febrero.pdf')).toBeInTheDocument();
      expect(props.onClose).not.toHaveBeenCalled();
      await logBill();
      expect(await progress('Bill 3 of 3 · marzo.pdf')).toBeInTheDocument();
      await logBill();

      await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
      expect(props.onSubmitReceipt).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1][1].body).toBe(files[1]);
    });

    it('skips a PDF without logging it', async () => {
      const { props } = renderPdf(complete, { files: many() });
      await screen.findByLabelText('Who sent it?');

      fireEvent.click(screen.getByRole('button', { name: 'Skip this one' }));

      expect(await progress('Bill 2 of 3 · febrero.pdf')).toBeInTheDocument();
      expect(props.onSubmitReceipt).not.toHaveBeenCalled();
    });

    it('stops the batch with Cancel, and keeps what was already logged', async () => {
      const { props } = renderPdf(complete, { files: many() });
      await logBill();
      await progress('Bill 2 of 3 · febrero.pdf');
      await screen.findByLabelText('Who sent it?');

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onSubmitReceipt).toHaveBeenCalledTimes(1);
    });

    it('offers to skip a PDF that could not be read, and goes on with the rest', async () => {
      fetchMock.mockResolvedValueOnce(reply(422, { error: 'x', code: 'UNREADABLE_DOCUMENT' }));
      renderPdf(complete, { files: many() });

      fireEvent.click(await screen.findByRole('button', { name: 'Skip this one' }));

      expect(await progress('Bill 2 of 3 · febrero.pdf')).toBeInTheDocument();
      expect(await screen.findByLabelText('Who sent it?')).toHaveValue('Iberdrola');
    });
  });
});
