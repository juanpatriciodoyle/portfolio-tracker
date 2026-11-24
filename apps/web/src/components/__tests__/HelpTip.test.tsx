import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HelpTip from '../HelpTip';

const renderTip = () => render(<HelpTip term="Money you put in" text="The money you added yourself." />);
const button = () => screen.getByRole('button', { name: 'About Money you put in' });
const popover = () => screen.queryByRole('dialog', { name: 'Money you put in' });

/** A real mouse enters, then leaves; the close waits a moment so the pointer can cross onto the explanation. */
const CLOSE_DELAY_MS = 200;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('HelpTip: opens on hover', () => {
  it('shows the explanation when the pointer rests on the "?", with no click', () => {
    renderTip();
    expect(popover()).toBeNull();

    fireEvent.mouseEnter(button());

    expect(popover()).toHaveTextContent('The money you added yourself.');
    expect(button()).toHaveAttribute('aria-expanded', 'true');
  });

  it('points the button at the explanation while it is open', () => {
    renderTip();
    fireEvent.mouseEnter(button());

    expect(button()).toHaveAttribute('aria-describedby', popover()?.id);
  });

  it('closes a moment after the pointer leaves', () => {
    renderTip();
    fireEvent.mouseEnter(button());
    fireEvent.mouseLeave(button());
    expect(popover()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(CLOSE_DELAY_MS);
    });

    expect(popover()).toBeNull();
    expect(button()).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays open while the pointer crosses from the "?" onto the explanation', () => {
    renderTip();
    fireEvent.mouseEnter(button());
    fireEvent.mouseLeave(button());
    fireEvent.mouseEnter(popover() as HTMLElement);

    act(() => {
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
    });

    expect(popover()).not.toBeNull();

    fireEvent.mouseLeave(popover() as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(CLOSE_DELAY_MS);
    });
    expect(popover()).toBeNull();
  });
});

describe('HelpTip: keyboard and touch', () => {
  it('opens when the keyboard focuses it, and closes when focus leaves', () => {
    renderTip();

    fireEvent.focus(button());
    expect(popover()).not.toBeNull();

    fireEvent.blur(button());
    expect(popover()).toBeNull();
  });

  it('does not treat the focus that comes with a mouse press as a keyboard opening', () => {
    renderTip();

    fireEvent.mouseDown(button());
    fireEvent.focus(button());

    expect(popover()).toBeNull();
  });

  it('a tap or click keeps it open after the pointer leaves, and a second click lets it go', () => {
    renderTip();
    fireEvent.mouseEnter(button());
    fireEvent.click(button());
    fireEvent.mouseLeave(button());
    act(() => {
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
    });
    expect(popover()).not.toBeNull();

    fireEvent.click(button());
    expect(popover()).toBeNull();
  });

  it('closes on Esc even while the pointer is still on it', () => {
    renderTip();
    fireEvent.mouseEnter(button());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(popover()).toBeNull();
  });

  it('closes on a click elsewhere', () => {
    renderTip();
    fireEvent.click(button());

    fireEvent.mouseDown(document.body);

    expect(popover()).toBeNull();
  });
});
