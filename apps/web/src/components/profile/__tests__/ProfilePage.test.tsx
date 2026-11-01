import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ENCRYPTION_NOT_CONFIGURED, type BillingRecordDto, type LivingPhaseDto, type ProfileData, type TimelineEntryDto, type TrendsResponse } from '../../../contracts';
import * as client from '../../../lib/apiClient';
import { ApiError, type RequestOptions } from '../../../lib/apiClient';
import { makeBill, makeEmptyTrends, makeEntry, makePhase, makeProfile, makeTrends } from '../../../test/fixtures';
import { chooseCountry, clickContinue } from '../../../test/wizardHelpers';
import ProfilePage from '../ProfilePage';

vi.mock('../../../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/apiClient')>();
  return { ...actual, apiRequest: vi.fn(), apiCommand: vi.fn() };
});

type RequestFn = (path: string, schema: unknown, options?: RequestOptions) => Promise<unknown>;
type CommandFn = (path: string, options: RequestOptions) => Promise<void>;
const apiRequest = client.apiRequest as unknown as Mock<RequestFn>;
const apiCommand = client.apiCommand as unknown as Mock<CommandFn>;

const madrid = makePhase({ id: 'p1', name: 'Madrid', startDate: '2022-09-01', endDate: null });
const lisbon = makePhase({
  id: 'p2',
  name: 'Lisbon',
  city: 'Lisbon',
  countryCode: 'PT',
  startDate: '2020-01-01',
  endDate: '2022-08-31',
  fixedCosts: [],
});
const madridEntry = makeEntry({ phaseId: 'p1', name: 'Madrid', status: 'current' });
const lisbonEntry = makeEntry({
  phaseId: 'p2',
  name: 'Lisbon',
  city: 'Lisbon',
  countryCode: 'PT',
  startDate: '2020-01-01',
  endDate: '2022-08-31',
  status: 'past',
  monthlyFixedCostsMinor: 125000,
});

interface World {
  profile: ProfileData;
  phases: LivingPhaseDto[];
  entries: TimelineEntryDto[];
  records: BillingRecordDto[];
  trends: TrendsResponse;
  failures: Record<string, Error>;
}

/** A tiny fake server. `failures` maps "METHOD /path" (GET has no method prefix) to an error. */
function serve(initial: Partial<World> = {}) {
  const world: World = {
    profile: makeProfile(),
    phases: [madrid, lisbon],
    entries: [madridEntry, lisbonEntry],
    records: [],
    trends: makeEmptyTrends(),
    failures: {},
    ...initial,
  };
  apiRequest.mockImplementation(async (path, _schema, options) => {
    const route = path.split('?')[0];
    const key = options?.method && options.method !== 'GET' ? `${options.method} ${route}` : route;
    if (world.failures[key]) throw world.failures[key];
    if (key === '/api/profile') return world.profile;
    if (key === '/api/living-phases') return { phases: world.phases };
    if (key === '/api/living-phases/timeline') return { asOf: '2026-10-31', entries: world.entries };
    if (key === 'POST /api/living-phases') return { id: 'new-phase' };
    if (key === '/api/billing-records') return { records: world.records };
    if (key === 'POST /api/billing-records') return { id: 'new-bill' };
    if (key === '/api/insights/trends') return world.trends;
    if (key === '/api/living-phases/compare') {
      return {
        comparable: true,
        fromPhaseId: 'p2',
        toPhaseId: 'p1',
        currency: 'EUR',
        monthlyIncomeDeltaMinor: 40000,
        monthlyFixedCostsDeltaMinor: 25000,
        savingsCapacityDeltaMinor: 15000,
        fixedCostsDeltaFraction: 0.2,
        categories: [{ category: 'RENT', fromMinor: 100000, toMinor: 120000, deltaMinor: 20000 }],
      };
    }
    throw new Error(`unexpected request ${key}`);
  });
  return world;
}

function renderPage() {
  const onBack = vi.fn();
  const onSignedOut = vi.fn();
  render(<ProfilePage onBack={onBack} onSignedOut={onSignedOut} />);
  return { onBack, onSignedOut };
}

/** Throws until the card is on screen, so `waitFor` can retry while data is still loading. */
function cardFor(name: string) {
  const card = screen
    .queryAllByRole('article')
    .find((candidate) => within(candidate).queryByRole('heading', { level: 3, name: new RegExp(name) }) !== null);
  if (!card) throw new Error(`No card for "${name}" yet`);
  return card;
}

beforeEach(() => {
  sessionStorage.clear(); // wizards keep drafts there
  apiRequest.mockReset();
  apiCommand.mockReset();
  apiCommand.mockResolvedValue(undefined);
});

describe('ProfilePage loading', () => {
  it('shows the profile and the phases, where you live now first', async () => {
    serve();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Living phases' })).toBeInTheDocument();
    expect(screen.getByText('Juan Doyle')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['🇪🇸 Madrid', '🇵🇹 Lisbon']);
  });

  it('invites the first living phase when there are none', async () => {
    serve({ phases: [], entries: [] });
    renderPage();

    expect(await screen.findByText('Where have you lived?')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Add living phase' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add your first living phase' }));
    expect(screen.getByRole('dialog', { name: 'Add a living phase' })).toBeInTheDocument();
    await chooseCountry('Country', 'por', /Portugal/);
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Porto' } });
    clickContinue();
    expect(screen.getByLabelText('Still living here')).toBeChecked();
  });

  it('goes back to the dashboard', async () => {
    serve();
    const { onBack } = renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });

    fireEvent.click(screen.getByRole('button', { name: /Dashboard/ }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers to sign in again when the session has ended', async () => {
    serve({ failures: { '/api/profile': new ApiError(401, 'Access denied', null), '/api/living-phases': new ApiError(401, 'Access denied', null) } });
    const { onSignedOut } = renderPage();

    expect(await screen.findByText(/Your session has ended/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Living phases' })).not.toBeInTheDocument();
  });

  it('tells a developer which setting is missing when the server has no encryption key', async () => {
    const unavailable = new ApiError(503, 'Profile encryption is not configured', {
      error: 'Profile encryption is not configured',
      code: ENCRYPTION_NOT_CONFIGURED,
    });
    serve({ failures: { '/api/profile': unavailable, '/api/living-phases': unavailable } });
    renderPage();

    expect(await screen.findByText('PROFILE_ENCRYPTION_KEY')).toBeInTheDocument();
    expect(screen.getByText('apps/api/.env')).toBeInTheDocument();
  });

  it('shows an error with a way to try again', async () => {
    const world = serve({ failures: { '/api/living-phases': new TypeError('Failed to fetch') } });
    renderPage();

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();

    world.failures = {};
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Living phases' })).toBeInTheDocument();
  });
});

describe('ProfilePage comparing', () => {
  it('lays chosen homes out as columns, earliest first, listing only rows that differ by more than 5%', async () => {
    serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    expect(screen.getByText('Pick two to four phases to compare them.')).toBeInTheDocument();

    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: 'Compare' }));
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: 'Compare' }));

    const table = await screen.findByRole('table', { name: /differ by more than 5%/ });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['🇵🇹 Lisbon', '🇪🇸 Madrid']);
    expect(within(table).getByRole('row', { name: /Fixed costs €1,250 €1,500/ })).toBeInTheDocument();
    expect(within(table).queryByRole('row', { name: /^Income/ })).not.toBeInTheDocument();
    expect(apiRequest.mock.calls.some(([path]) => path.startsWith('/api/living-phases/compare'))).toBe(false);
  });

  it('asks the server to convert two homes in different currencies', async () => {
    serve({ entries: [madridEntry, { ...lisbonEntry, currency: 'USD' }] });
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });

    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: 'Compare' }));
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: 'Compare' }));

    expect(await screen.findByText('Fixed costs in 🇪🇸 Madrid are €250 more per month than in 🇵🇹 Lisbon (20%).')).toBeInTheDocument();
    expect(apiRequest.mock.calls.some(([path]) => path === '/api/living-phases/compare?from=p2&to=p1')).toBe(true);
    expect(screen.getByRole('heading', { level: 2, name: /Lisbon.*Madrid/ })).toBeInTheDocument();
  });

  it('closes the comparison and clears the choice', async () => {
    serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: 'Compare' }));
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: 'Compare' }));
    await screen.findByRole('button', { name: 'Close comparison' });

    fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }));

    expect(screen.queryByRole('button', { name: 'Close comparison' })).not.toBeInTheDocument();
    expect(within(cardFor('Madrid')).getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the four most recent choices', async () => {
    const extra = (id: string, name: string) => ({
      phase: makePhase({ id, name, city: name, countryCode: 'PT', startDate: '2017-01-01', endDate: '2019-12-31', fixedCosts: [] }),
      entry: makeEntry({ phaseId: id, name, city: name, countryCode: 'PT', status: 'past', startDate: '2017-01-01', endDate: '2019-12-31' }),
    });
    const [porto, faro] = [extra('p3', 'Porto'), extra('p4', 'Faro')];
    serve({ phases: [madrid, lisbon, porto.phase, faro.phase], entries: [madridEntry, lisbonEntry, porto.entry, faro.entry] });
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });

    for (const name of ['Madrid', 'Lisbon', 'Porto', 'Faro']) {
      fireEvent.click(within(cardFor(name)).getByRole('button', { name: 'Compare' }));
    }
    expect(within(await screen.findByRole('table')).getAllByRole('columnheader')).toHaveLength(4);
  });

  it('drops the oldest choice when a fifth home is picked', async () => {
    const more = ['Porto', 'Faro', 'Evora'].map((name, index) => ({
      phase: makePhase({ id: `x${index}`, name, city: name, startDate: '2017-01-01', endDate: '2019-12-31', fixedCosts: [] }),
      entry: makeEntry({ phaseId: `x${index}`, name, city: name, status: 'past', startDate: '2017-01-01', endDate: '2019-12-31' }),
    }));
    serve({ phases: [madrid, lisbon, ...more.map((m) => m.phase)], entries: [madridEntry, lisbonEntry, ...more.map((m) => m.entry)] });
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });

    for (const name of ['Madrid', 'Lisbon', 'Porto', 'Faro', 'Evora']) {
      fireEvent.click(within(cardFor(name)).getByRole('button', { name: 'Compare' }));
    }

    expect(within(cardFor('Madrid')).getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(cardFor('Evora')).getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('refreshes an open comparison after a phase is changed, instead of leaving old numbers on screen', async () => {
    const world = serve({ entries: [madridEntry, { ...lisbonEntry, currency: 'USD' }] });
    const answer = apiRequest.getMockImplementation() as RequestFn;
    let delta = 25000;
    apiRequest.mockImplementation(async (path, schema, options) => {
      const response = await answer(path, schema, options);
      return path.startsWith('/api/living-phases/compare')
        ? { ...(response as object), monthlyFixedCostsDeltaMinor: delta }
        : response;
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: 'Compare' }));
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: 'Compare' }));
    await screen.findByText(/Fixed costs in 🇪🇸 Madrid are €250 more per month/);

    delta = 40000; // what the server now says, after the person edits Lisbon
    world.entries = [madridEntry, { ...lisbonEntry, currency: 'USD', monthlyFixedCostsMinor: 110000 }];
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: /Lisbon/ }));
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: /Edit phase/ }));
    clickContinue();
    clickContinue();
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/Fixed costs in 🇪🇸 Madrid are €400 more per month/)).toBeInTheDocument();
    expect(screen.queryByText(/€250 more per month/)).not.toBeInTheDocument();
  });
});

describe('ProfilePage changes', () => {
  async function addPortoPhase() {
    fireEvent.click(screen.getByRole('button', { name: /Add living phase/ }));
    await chooseCountry('Country', 'portu', /Portugal/);
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Porto' } });
    clickContinue();
    fireEvent.change(screen.getByLabelText('Moved in'), { target: { value: '2017-01-01' } });
    fireEvent.change(screen.getByLabelText('Moved out'), { target: { value: '2019-12-31' } });
    clickContinue();
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2100' } });
    clickContinue();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add living phase' }));
  }

  it('adds a phase, closes the dialog and opens the new card for its bills', async () => {
    const world = serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    world.phases = [...world.phases, makePhase({ id: 'new-phase', name: 'Porto flat', city: 'Porto', countryCode: 'PT', startDate: '2017-01-01', endDate: '2019-12-31', fixedCosts: [] })];
    world.entries = [...world.entries, makeEntry({ phaseId: 'new-phase', name: 'Porto flat', city: 'Porto', countryCode: 'PT', status: 'past', startDate: '2017-01-01', endDate: '2019-12-31' })];

    await addPortoPhase();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const post = apiRequest.mock.calls.find(([, , options]) => options?.method === 'POST');
    expect(post?.[0]).toBe('/api/living-phases');
    expect(post?.[2]?.body).toMatchObject({ name: '🇵🇹 Porto', city: 'Porto', countryCode: 'PT', monthlyIncomeMinor: 210000, endDate: '2019-12-31' });
    const card = await waitFor(() => cardFor('Porto'));
    expect(within(card).getByRole('button', { name: /Porto/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Living phase added')).toBeInTheDocument();
  });

  it('keeps the dialog open on the dates and names the clash when they overlap', async () => {
    serve({
      failures: {
        'POST /api/living-phases': new ApiError(409, 'Phases overlap', { error: 'Phases overlap', conflictingPhaseIds: ['p2'] }),
      },
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });

    await addPortoPhase();

    expect(await screen.findByText(/These dates overlap 🇵🇹 Lisbon \(Jan 2020 – Aug 2022\)/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'When were you there?' })).toBeInTheDocument();
  });

  it('edits a phase through the dialog', async () => {
    serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: /Lisbon/ }));

    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: /Edit phase/ }));
    expect(screen.getByRole('dialog', { name: 'Edit living phase' })).toBeInTheDocument();
    clickContinue();
    clickContinue();
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(apiCommand).toHaveBeenCalledWith('/api/living-phases/p2', {
        method: 'PATCH',
        body: expect.objectContaining({ monthlyIncomeMinor: 290000, name: '🇵🇹 Lisbon' }),
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('deletes a phase after confirming', async () => {
    serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: /Lisbon/ }));

    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: /Delete phase/ }));
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(apiCommand).toHaveBeenCalledWith('/api/living-phases/p2', { method: 'DELETE' }));
  });

  it('saves the profile', async () => {
    serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Juan P. Doyle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(apiCommand).toHaveBeenCalledWith('/api/profile', { method: 'PUT', body: { ...makeProfile(), fullName: 'Juan P. Doyle' } })
    );
    expect(await screen.findByText('Juan P. Doyle')).toBeInTheDocument();
  });
});

const trendLoads = () => apiRequest.mock.calls.filter(([path]) => path === '/api/insights/trends').length;
const timelineLoads = () => apiRequest.mock.calls.filter(([path]) => path === '/api/living-phases/timeline').length;
const billLoads = () =>
  apiRequest.mock.calls.filter(([path, , options]) => path === '/api/billing-records' && !options?.method).length;

describe('ProfilePage trends and bills', () => {
  it('shows the trends card above the phase cards, from what the server calculated', async () => {
    serve({ trends: makeTrends(), records: [makeBill({ phaseId: 'p1' })] });
    renderPage();

    const row = await screen.findByRole('row', { name: /^Fixed costs/ });

    const trends = screen.getByRole('heading', { level: 2, name: 'Trends' });
    expect(trends.closest('section')).toContainElement(row);
    const list = screen.getByRole('list', { name: 'Living phases' });
    expect(trends.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('invites the first bill when there are none, and opens the home to log it in', async () => {
    serve();
    renderPage();
    await screen.findByText(/No bills yet\./);

    fireEvent.click(screen.getByRole('button', { name: 'Open 🇪🇸 Madrid' }));

    expect(within(cardFor('Madrid')).getByRole('button', { name: /Madrid/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(cardFor('Madrid')).getByRole('button', { name: /Add an expense/ })).toBeInTheDocument();
    expect(within(cardFor('Madrid')).getByRole('button', { name: /Manage bills & documents/ })).toBeInTheDocument();
  });

  it('shows each phase its own bills in the ledger, with no banner comparing them to what was declared', async () => {
    serve({
      records: [makeBill({ id: 'mine', phaseId: 'p1', vendor: 'Iberdrola' }), makeBill({ id: 'other', phaseId: 'p2', vendor: 'EDP' })],
      trends: makeTrends(),
    });
    renderPage();
    await screen.findByRole('row', { name: /^Fixed costs/ });
    await waitFor(() => expect(billLoads()).toBe(1));
    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: /Madrid/ }));

    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: /Manage bills & documents/ }));

    const bills = await screen.findByRole('list', { name: 'Bills received' });
    expect(within(bills).getByText(/Iberdrola/)).toBeInTheDocument();
    expect(within(bills).queryByText(/EDP/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bills say about/)).not.toBeInTheDocument();
  });

  it('logs a bill and reloads the trends and the bills, so the numbers are never stale', async () => {
    serve();
    renderPage();
    await screen.findByText(/No bills yet\./);
    await waitFor(() => expect(trendLoads()).toBe(1));
    expect(billLoads()).toBe(1);
    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: /Madrid/ }));
    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: /Add an expense/ }));

    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Iberdrola' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Electricity' }));
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '96' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Every 2 months' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        '/api/billing-records',
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            phaseId: 'p1',
            category: 'ELECTRICITY',
            cadence: 'BIMONTHLY',
            periodStart: '2026-09-01',
            periodEnd: '2026-10-31',
            amountMinor: 9600,
            vendor: 'Iberdrola',
          }),
        })
      )
    );
    await waitFor(() => expect(trendLoads()).toBe(2));
    await waitFor(() => expect(billLoads()).toBeGreaterThanOrEqual(2));
    // The monthly costs of the home come from its bills, so the timeline is read again too.
    await waitFor(() => expect(timelineLoads()).toBeGreaterThanOrEqual(2));
  });

  it('shows the new averages once they arrive', async () => {
    const world = serve();
    renderPage();
    await screen.findByText(/No bills yet\./);
    world.trends = makeTrends();
    world.records = [makeBill({ phaseId: 'p1' })];
    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: /Madrid/ }));
    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: /Add an expense/ }));
    fireEvent.change(screen.getByLabelText('Who sent it?'), { target: { value: 'Iberdrola' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Electricity' }));
    fireEvent.change(screen.getByLabelText('Total on the bill'), { target: { value: '96' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByRole('row', { name: /^Fixed costs/ })).toBeInTheDocument();
    expect(screen.queryByText(/No bills yet\./)).not.toBeInTheDocument();
  });

  it('refreshes trends and bills after a living phase changes (a deleted phase takes its bills with it)', async () => {
    const world = serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    await waitFor(() => expect(trendLoads()).toBe(1));
    world.entries = [madridEntry, { ...lisbonEntry, monthlyFixedCostsMinor: 100000 }];

    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: /Lisbon/ }));
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: /Delete phase/ }));
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(trendLoads()).toBe(2));
    expect(billLoads()).toBe(2);
  });

  it('does not break the page when the trends cannot be loaded', async () => {
    serve({ failures: { '/api/insights/trends': new ApiError(500, 'Internal Server Error', null) } });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/try again/i);
    expect(alert).not.toHaveTextContent(/internal server error/i);
    expect(screen.getByRole('heading', { level: 3, name: '🇪🇸 Madrid' })).toBeInTheDocument();
  });
});

describe('ProfilePage first time', () => {
  const emptyProfile = makeProfile({ fullName: null, birthYear: null, nationalities: [], taxResidence: null, employmentStatus: null });

  it('offers one button, and no competing ways to add a home', async () => {
    serve({ profile: emptyProfile, phases: [], entries: [] });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Tell us about yourself' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Add living phase/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add your first living phase' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add details' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((button) => button.className.includes('btn-primary-apply'))).toHaveLength(1);
  });

  it('guides from the profile into the first living phase, then saves both', async () => {
    serve({ profile: emptyProfile, phases: [], entries: [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Tell us about yourself' }));
    expect(screen.getByRole('dialog', { name: 'Tell us about yourself' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Joe Doyle' } });
    clickContinue();
    clickContinue();
    clickContinue();
    await chooseCountry('Country', 'arg', /Argentina/);
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Buenos Aires' } });
    clickContinue();
    fireEvent.change(screen.getByLabelText('Moved in'), { target: { value: '2024-01-01' } });
    clickContinue();
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '1500' } });
    clickContinue();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(apiCommand).toHaveBeenCalledWith('/api/profile', { method: 'PUT', body: expect.objectContaining({ fullName: 'Joe Doyle' }) });
    const post = apiRequest.mock.calls.find(([, , options]) => options?.method === 'POST');
    expect(post?.[0]).toBe('/api/living-phases');
    expect(post?.[2]?.body).toMatchObject({ name: '🇦🇷 Buenos Aires', countryCode: 'AR', startDate: '2024-01-01', endDate: null });
    expect(screen.getByText('Profile saved')).toBeInTheDocument();
  });

  it('keeps a single call to action once the profile is filled in but there is no home yet', async () => {
    serve({ phases: [], entries: [] });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Add your first living phase' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /^Add living phase/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tell us about yourself' })).not.toBeInTheDocument();
  });
});
