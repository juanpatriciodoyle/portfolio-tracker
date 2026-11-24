import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HumanCheck from '../HumanCheck';

// The vendor widget: it renders a button that plays "the person passed", and one that plays "it could not load".
const vendor = vi.hoisted(() => ({ resets: 0, props: null as null | Record<string, unknown> }));
vi.mock('@hcaptcha/react-hcaptcha', () => ({
  default: forwardRef((props: Record<string, unknown>, ref) => {
    vendor.props = props;
    useImperativeHandle(ref, () => ({ resetCaptcha: () => void (vendor.resets += 1) }));
    return (
      <div>
        <button onClick={() => (props.onVerify as (t: string) => void)('answer-1')}>pass</button>
        <button onClick={() => (props.onError as (e: string) => void)('script-error')}>break</button>
      </div>
    );
  }),
}));

const widgetProps = { siteKey: '10000000-ffff-ffff-ffff-000000000001', onToken: vi.fn(), onExpire: vi.fn(), resetCount: 0 };

beforeEach(() => {
  vendor.resets = 0;
  vendor.props = null;
  widgetProps.onToken.mockReset();
});

describe('HumanCheck', () => {
  it('draws the widget dark, for the site key it was given, and reports the answer', () => {
    render(<HumanCheck {...widgetProps} />);

    expect(vendor.props).toMatchObject({ sitekey: widgetProps.siteKey, theme: 'dark', sentry: false });
    fireEvent.click(screen.getByText('pass'));
    expect(widgetProps.onToken).toHaveBeenCalledWith('answer-1');
  });

  it('empties the box when told to start over, but not when it first appears', () => {
    const { rerender } = render(<HumanCheck {...widgetProps} />);
    expect(vendor.resets).toBe(0);

    rerender(<HumanCheck {...widgetProps} resetCount={1} />);
    expect(vendor.resets).toBe(1);
  });

  it('says calmly that it could not load, and a retry brings the widget back', () => {
    render(<HumanCheck {...widgetProps} />);

    fireEvent.click(screen.getByText('break'));
    expect(screen.getByRole('alert')).toHaveTextContent('The security check could not load. Check your connection and try again.');
    expect(screen.queryByText('pass')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('pass')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
