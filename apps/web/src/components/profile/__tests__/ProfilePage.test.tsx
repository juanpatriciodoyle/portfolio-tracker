import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ENCRYPTION_NOT_CONFIGURED, type LivingPhaseDto, type TimelineEntryDto } from '../../../contracts';
import * as client from '../../../lib/apiClient';
import { ApiError, type RequestOptions } from '../../../lib/apiClient';
import { makeEntry, makePhase, makeProfile } from '../../../test/fixtures';
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
  phases: LivingPhaseDto[];
  entries: TimelineEntryDto[];
  failures: Record<string, Error>;
}

/** A tiny fake server. `failures` maps "METHOD /path" (GET has no method prefix) to an error. */
function serve(initial: Partial<World> = {}) {
  const world: World = { phases: [madrid, lisbon], entries: [madridEntry, lisbonEntry], failures: {}, ...initial };
  apiRequest.mockImplementation(async (path, _schema, options) => {
    const route = path.split('?')[0];
    const key = options?.method && options.method !== 'GET' ? `${options.method} ${route}` : route;
    if (world.failures[key]) throw world.failures[key];
    if (key === '/api/profile') return makeProfile();
    if (key === '/api/living-phases') return { phases: world.phases };
    if (key === '/api/living-phases/timeline') return { asOf: '2026-10-31', entries: world.entries };
    if (key === 'POST /api/living-phases') return { id: 'new-phase' };
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
    .find((candidate) => within(candidate).queryByRole('heading', { level: 3, name }) !== null);
  if (!card) throw new Error(`No card for "${name}" yet`);
  return card;
}

beforeEach(() => {
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
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Madrid', 'Lisbon']);
  });

  it('invites the first living phase when there are none', async () => {
    serve({ phases: [], entries: [] });
    renderPage();

    expect(await screen.findByText('Where have you lived?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add your first living phase' }));
    expect(screen.getByRole('heading', { name: 'Add a living phase' })).toBeInTheDocument();
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
  it('compares two chosen homes, the earlier one first', async () => {
    serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    expect(screen.getByText('Pick two phases to compare them.')).toBeInTheDocument();

    fireEvent.click(within(cardFor('Madrid')).getByRole('button', { name: 'Compare' }));
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: 'Compare' }));

    expect(await screen.findByText('Fixed costs in Madrid are €250 more per month than in Lisbon (20%).')).toBeInTheDocument();
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

  it('keeps only the two most recent choices', async () => {
    serve({
      phases: [madrid, lisbon, makePhase({ id: 'p3', name: 'Porto', startDate: '2017-01-01', endDate: '2019-12-31', fixedCosts: [] })],
      entries: [madridEntry, lisbonEntry, makeEntry({ phaseId: 'p3', name: 'Porto', status: 'past', startDate: '2017-01-01', endDate: '2019-12-31' })],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });

    for (const name of ['Madrid', 'Lisbon', 'Porto']) {
      fireEvent.click(within(cardFor(name)).getByRole('button', { name: 'Compare' }));
    }

    expect(within(cardFor('Madrid')).getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(cardFor('Lisbon')).getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(cardFor('Porto')).getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('refreshes an open comparison after a phase is changed, instead of leaving old numbers on screen', async () => {
    const world = serve();
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
    await screen.findByText(/Fixed costs in Madrid are €250 more per month/);

    delta = 40000; // what the server now says, after the person edits Lisbon
    world.entries = [madridEntry, { ...lisbonEntry, monthlyFixedCostsMinor: 110000 }];
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: 'Lisbon' }));
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: /Edit phase/ }));
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/Fixed costs in Madrid are €400 more per month/)).toBeInTheDocument();
    expect(screen.queryByText(/€250 more per month/)).not.toBeInTheDocument();
  });
});

describe('ProfilePage changes', () => {
  async function addLisbonLikePhase() {
    fireEvent.click(screen.getByRole('button', { name: /Add living phase/ }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Porto flat' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Porto' } });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'PT' } });
    fireEvent.change(screen.getByLabelText('Moved in'), { target: { value: '2017-01-01' } });
    fireEvent.change(screen.getByLabelText('Moved out'), { target: { value: '2019-12-31' } });
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2100' } });
    const form = screen.getByRole('form', { name: 'Add a living phase' });
    fireEvent.click(within(form).getByRole('button', { name: 'Add living phase' }));
  }

  it('adds a phase, closes the drawer and opens the new card for its bills', async () => {
    const world = serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    world.phases = [...world.phases, makePhase({ id: 'new-phase', name: 'Porto flat', startDate: '2017-01-01', endDate: '2019-12-31', fixedCosts: [] })];
    world.entries = [...world.entries, makeEntry({ phaseId: 'new-phase', name: 'Porto flat', status: 'past', startDate: '2017-01-01', endDate: '2019-12-31' })];

    await addLisbonLikePhase();

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Add a living phase' })).not.toBeInTheDocument());
    const post = apiRequest.mock.calls.find(([, , options]) => options?.method === 'POST');
    expect(post?.[0]).toBe('/api/living-phases');
    expect(post?.[2]?.body).toMatchObject({ name: 'Porto flat', countryCode: 'PT', monthlyIncomeMinor: 210000, endDate: '2019-12-31' });
    const card = await waitFor(() => cardFor('Porto flat'));
    expect(within(card).getByRole('button', { name: 'Porto flat' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Living phase added')).toBeInTheDocument();
  });

  it('keeps the drawer open and names the clash when dates overlap', async () => {
    serve({
      failures: {
        'POST /api/living-phases': new ApiError(409, 'Phases overlap', { error: 'Phases overlap', conflictingPhaseIds: ['p2'] }),
      },
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });

    await addLisbonLikePhase();

    expect(await screen.findByText(/These dates overlap Lisbon \(Jan 2020 – Aug 2022\)/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add a living phase' })).toBeInTheDocument();
  });

  it('edits a phase through the drawer', async () => {
    serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: 'Lisbon' }));

    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: /Edit phase/ }));
    expect(screen.getByRole('heading', { name: 'Edit living phase' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Monthly net income'), { target: { value: '2900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(apiCommand).toHaveBeenCalledWith('/api/living-phases/p2', {
        method: 'PATCH',
        body: expect.objectContaining({ monthlyIncomeMinor: 290000, name: 'Lisbon' }),
      })
    );
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit living phase' })).not.toBeInTheDocument());
  });

  it('deletes a phase after confirming', async () => {
    serve();
    renderPage();
    await screen.findByRole('heading', { name: 'Living phases' });
    fireEvent.click(within(cardFor('Lisbon')).getByRole('button', { name: 'Lisbon' }));

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
