import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import AppHeader from '../AppHeader';

const header = (isGuest: boolean | undefined) => (
  <LocaleProvider>
    <AppHeader
      isRealInflationMode={false}
      onToggleInflation={() => undefined}
      country="Spain"
      onOpenCountry={() => undefined}
      onLogTransaction={() => undefined}
      onOpenProfile={() => undefined}
      onSignOut={() => undefined}
      isGuest={isGuest}
    />
  </LocaleProvider>
);

describe('AppHeader: the Demo chip', () => {
  it('shows a Demo chip that says nothing here is real, for a demo guest', () => {
    render(header(true));

    const chip = screen.getByRole('note');
    expect(chip.textContent).toBe('Demo');
    expect(chip.getAttribute('title')).toBe('Sample data: nothing here is real.');
    expect(chip.getAttribute('aria-label')).toBe('Demo. Sample data: nothing here is real.');
  });

  it('sits at the far left beside the name of the app, not among the tools on the right', () => {
    const { container } = render(header(true));

    const chip = screen.getByRole('note');
    const lead = container.querySelector('.app-header__lead') as HTMLElement;
    const actions = container.querySelector('.app-header__actions') as HTMLElement;

    expect(within(lead).getByText('Portfolio Tracker')).toBeInTheDocument();
    expect(lead).toContainElement(chip);
    expect(actions).not.toContainElement(chip);
    // The lead comes first in the header, so it is the leftmost thing.
    expect(container.querySelector('.app-header')?.firstElementChild).toBe(lead);
  });

  it.each([false, undefined])('shows no chip for a real account (%s)', (isGuest) => {
    render(header(isGuest));

    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('AppHeader: the tools', () => {
  it('has a language icon (a menu button) instead of a dropdown, and a one-click sign out', () => {
    render(header(false));

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Language' })).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});

describe('AppHeader: the phone layout has the same two rows for everyone', () => {
  it('keeps the chip out of both groups and the groups as the only children of the actions, so a phone can place the chip on the tools row', () => {
    const { container } = render(header(true));

    const headerElement = container.querySelector('.app-header') as HTMLElement;
    const lead = container.querySelector('.app-header__lead') as HTMLElement;
    const actions = container.querySelector('.app-header__actions') as HTMLElement;
    const chip = screen.getByRole('note');

    expect(lead.parentElement).toBe(headerElement);
    expect(actions.parentElement).toBe(headerElement);
    expect([...actions.children].map((child) => child.className)).toEqual(['app-header__inflation', 'app-header__tools']);
    for (const group of actions.children) expect(group).not.toContainElement(chip);
  });

  it('is the same header, with or without the chip, apart from the chip itself', () => {
    const shape = (isGuest: boolean) => {
      const { container, unmount } = render(header(isGuest));
      const classes = [...container.querySelectorAll('.app-header, .app-header > *, .app-header__actions > *')].map((element) => element.className);
      unmount();
      return classes;
    };

    expect(shape(true)).toEqual(shape(false));
  });

  it('puts the inflation group on the first row, then the chip (left) and the tools (right) on the second, below 520px', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const phone = css.slice(css.indexOf('@media (max-width: 520px) {\n  /* A phone has two rows'));

    expect(phone).toMatch(/\.app-header__inflation \{ order: 1; flex: 1 0 100%; \}/);
    expect(phone).toMatch(/\.app-header__lead \{ order: 2; \}/);
    expect(phone).toMatch(/\.app-header__tools \{ order: 3; \}/);
    // The actions wrapper dissolves, so its two groups take part in the header's own rows.
    expect(css).toMatch(/\.app-header__actions \{ display: contents; \}/);
  });
});
