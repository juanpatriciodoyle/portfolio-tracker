import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSecondSalary } from '../../test/fixtures';
import { pendingRequest, submitTwice, tapTwice } from '../../test/doubleTap';
import CapitalMilestoneEditor from '../CapitalMilestoneEditor';
import { formForPreset } from '../capitalMilestoneForm';
import InflationSettingsModal from '../InflationSettingsModal';
import LoginModal from '../LoginModal';
import SecondSalaryCard from '../SecondSalaryCard';
import TransactionForm from '../TransactionForm';

vi.mock('@react-oauth/google', () => ({ useGoogleLogin: () => vi.fn() }));
// This server has the sneak peek, and this deployment has Google sign-in.
vi.mock('../../hooks/useAppConfig', () => ({ useAppConfig: () => ({ demoEnabled: true }) }));
vi.mock('../../lib/googleConfig', () => ({ GOOGLE_CLIENT_ID: 'test-client', isGoogleSignInConfigured: () => true }));
vi.mock('@simplewebauthn/browser', () => ({ startRegistration: vi.fn(), startAuthentication: vi.fn() }));

const ok = { ok: true as const, value: undefined };
const respond = (body: unknown, status = 200) => ({ ok: status < 400, json: async () => body }) as Response;

afterEach(() => vi.unstubAllGlobals());

describe('tapping twice saves once: standalone components', () => {
  it('Second Salary target', async () => {
    const save = vi.fn().mockResolvedValue(ok);
    render(<SecondSalaryCard secondSalary={makeSecondSalary()} onSaveTarget={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit target' }));
    fireEvent.change(screen.getByLabelText('Monthly target (EUR)'), { target: { value: '4000' } });

    submitTwice(screen.getByRole('button', { name: 'Save target' }).closest('form'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it('a capital milestone: save', async () => {
    const onSave = vi.fn().mockResolvedValue(ok);
    render(<CapitalMilestoneEditor initial={formForPreset('CUSTOM')} id="m1" currency="EUR" onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'House' } });
    fireEvent.change(screen.getByLabelText('Target amount'), { target: { value: '350000' } });

    submitTwice(screen.getByRole('form', { name: 'Milestone' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('a capital milestone: delete', async () => {
    const onDelete = vi.fn().mockResolvedValue(ok);
    render(<CapitalMilestoneEditor initial={formForPreset('CUSTOM')} id="m1" currency="EUR" onSave={vi.fn()} onDelete={onDelete} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete milestone' }));

    tapTwice(screen.getByRole('button', { name: 'Yes, delete it' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});

describe('tapping twice records one transaction', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('on Confirm, by tap or by Enter', async () => {
    const request = pendingRequest<Response>();
    const sent = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal('fetch', sent);
    render(<TransactionForm />);
    fireEvent.click(screen.getByRole('button', { name: /Deposit/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. 5000.00'), { target: { value: '500' } });

    const form = screen.getByRole('button', { name: 'Confirm' }).closest('form');
    submitTwice(form);
    tapTwice(screen.getByRole('button', { name: /Confirming/ }));

    const writes = sent.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Confirming/ })).toHaveAttribute('aria-busy', 'true');
    await act(async () => request.settle(respond({ ok: true })));
  });

  it('and can be tried again after the server refused it', async () => {
    const sent = vi
      .fn()
      .mockResolvedValueOnce(respond({ error: 'Not enough cash' }, 400))
      .mockResolvedValueOnce(respond({ ok: true }));
    vi.stubGlobal('fetch', sent);
    const onSuccess = vi.fn();
    render(<TransactionForm onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole('button', { name: /Deposit/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. 5000.00'), { target: { value: '500' } });

    fireEvent.submit(screen.getByRole('button', { name: 'Confirm' }).closest('form')!);
    await screen.findByText('Not enough cash');
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm' }).closest('form')!);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(sent).toHaveBeenCalledTimes(2);
  });
});

describe('tapping twice signs in once', () => {
  it('on the sneak peek', async () => {
    const request = pendingRequest<Response>();
    const sent = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal('fetch', sent);
    render(<LoginModal onSuccess={vi.fn()} />);

    tapTwice(screen.getByRole('button', { name: /sneak peek/i }));

    expect(sent).toHaveBeenCalledTimes(1);
    await act(async () => request.settle(respond({ success: true, token: 't', user: { id: 'd', email: 'demo@portfolio.local' } })));
  });

  it('on the passkey, and not at the same time as the sneak peek', async () => {
    const request = pendingRequest<Response>();
    const sent = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal('fetch', sent);
    render(<LoginModal onSuccess={vi.fn()} />);

    tapTwice(screen.getByRole('button', { name: /Passkey/ }));
    tapTwice(screen.getByRole('button', { name: /sneak peek/i }));

    expect(sent).toHaveBeenCalledTimes(1);
    await act(async () => request.settle(respond({ error: 'no' }, 400)));
  });
});

describe('tapping twice changes the inflation settings once', () => {
  it('on Save Settings', async () => {
    const request = pendingRequest<Response>();
    const sent = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal('fetch', sent);
    const onUpdate = vi.fn();
    render(<InflationSettingsModal currentCountry="Spain" currentRate={2.8} onClose={vi.fn()} onUpdate={onUpdate} />);

    submitTwice(screen.getByRole('button', { name: /Save Settings|Saving/ }).closest('form'));

    expect(sent).toHaveBeenCalledTimes(1);
    await act(async () => request.settle(respond({})));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('on Sync Latest', async () => {
    const request = pendingRequest<Response>();
    const sent = vi.fn().mockReturnValue(request.promise);
    vi.stubGlobal('fetch', sent);
    render(<InflationSettingsModal currentCountry="Spain" currentRate={2.8} onClose={vi.fn()} onUpdate={vi.fn()} />);

    tapTwice(screen.getByRole('button', { name: /Sync Latest/ }));

    expect(sent).toHaveBeenCalledTimes(1);
    await act(async () => request.settle(respond({ annualInflationRate: 3.1 })));
  });
});
