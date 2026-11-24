import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HumanCheckIncompleteError, type HumanCheckHandle } from '../../lib/humanCheck';
import HumanCheck from '../HumanCheck';

// The vendor widget: it records its props, answers execute() as the test says, and has a button that plays "its script did not load".
const vendor = vi.hoisted(() => ({ props: null as null | Record<string, unknown>, resets: 0, execute: null as null | (() => Promise<{ response: string }>) }));
vi.mock('@hcaptcha/react-hcaptcha', () => ({
  default: forwardRef((props: Record<string, unknown>, ref) => {
    vendor.props = props;
    useImperativeHandle(ref, () => ({ resetCaptcha: () => void (vendor.resets += 1), execute: () => vendor.execute!() }));
    return <button onClick={() => (props.onError as (e: string) => void)('script-error')}>break</button>;
  }),
}));

const SITE_KEY = '10000000-ffff-ffff-ffff-000000000001';

beforeEach(() => {
  vendor.props = null;
  vendor.resets = 0;
  vendor.execute = async () => ({ response: 'answer-1' });
});

describe('HumanCheck', () => {
  it('is the invisible kind, dark, for the site key it was given: nothing is drawn up front', () => {
    render(<HumanCheck siteKey={SITE_KEY} />);
    expect(vendor.props).toMatchObject({ sitekey: SITE_KEY, theme: 'dark', size: 'invisible', sentry: false });
  });

  it('runs the check on demand and gives the answer', async () => {
    const ref = createRef<HumanCheckHandle>();
    render(<HumanCheck ref={ref} siteKey={SITE_KEY} />);
    await expect(ref.current!.execute()).resolves.toBe('answer-1');
  });

  it('says it was not completed when the challenge is closed or answers nothing', async () => {
    const ref = createRef<HumanCheckHandle>();
    render(<HumanCheck ref={ref} siteKey={SITE_KEY} />);

    vendor.execute = async () => {
      throw new Error('challenge-closed');
    };
    await expect(ref.current!.execute()).rejects.toBeInstanceOf(HumanCheckIncompleteError);
    vendor.execute = async () => ({ response: '' });
    await expect(ref.current!.execute()).rejects.toBeInstanceOf(HumanCheckIncompleteError);
  });

  it('empties the widget on reset', () => {
    const ref = createRef<HumanCheckHandle>();
    render(<HumanCheck ref={ref} siteKey={SITE_KEY} />);
    act(() => ref.current!.reset());
    expect(vendor.resets).toBe(1);
  });

  it('says calmly that it could not load, and a retry brings the widget back; other vendor events are not a load failure', () => {
    render(<HumanCheck siteKey={SITE_KEY} />);

    act(() => (vendor.props!.onError as (e: string) => void)('challenge-closed'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('break'));
    expect(screen.getByRole('alert')).toHaveTextContent('The security check could not load. Check your connection and try again.');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('break')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
