import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import LanguageSelector from '../LanguageSelector';
import { LocaleProvider } from '../LocaleProvider';
import { useTranslation } from '../useTranslation';
import { setActiveLocale } from '../activeLocale';
import { LOCALE_STORAGE_KEY } from '../localeStore';
import { createMemoryStorage } from '../../test/memoryStorage';

function Greeting() {
  const { t, locale } = useTranslation();
  return (
    <p>
      {t('header.signOut')} · {locale}
    </p>
  );
}

const mountWithSelector = (initial?: 'en' | 'es-AR') =>
  render(
    <LocaleProvider initial={initial}>
      <LanguageSelector />
      <Greeting />
    </LocaleProvider>,
  );

const trigger = () => screen.getByRole('button', { name: /^(Language|Idioma)$/ });
const open = () => act(() => fireEvent.click(trigger()));
const item = (name: string) => screen.getByRole('menuitemradio', { name });

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: createMemoryStorage(), configurable: true });
});

afterEach(() => {
  cleanup();
  setActiveLocale(null);
  document.documentElement.lang = 'en';
});

describe('LanguageSelector: an icon that opens the choices', () => {
  it('is only an icon: no language is named on screen until it is opened', () => {
    mountWithSelector('en');

    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveAttribute('title', 'Language');
    expect(screen.queryByText('English')).not.toBeInTheDocument();
    expect(screen.queryByText('Español (Argentina)')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens a menu that names each language in its own words and marks the current one', () => {
    mountWithSelector('en');
    open();

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitemradio').map((option) => option.textContent)).toEqual(['English', 'Español (Argentina)']);
    expect(item('English')).toHaveAttribute('aria-checked', 'true');
    expect(item('Español (Argentina)')).toHaveAttribute('aria-checked', 'false');
  });

  it('puts focus on the current language when it opens', () => {
    mountWithSelector('es-AR');
    open();

    expect(item('Español (Argentina)')).toHaveFocus();
  });

  it('is labelled in the language of the screen', () => {
    mountWithSelector('en');
    expect(trigger()).toHaveAccessibleName('Language');
    open();
    act(() => fireEvent.click(item('Español (Argentina)')));
    expect(trigger()).toHaveAccessibleName('Idioma');
  });

  it('switches every word on screen, announces it in <html lang>, remembers the choice, closes and gives focus back', () => {
    mountWithSelector('en');
    expect(screen.getByText('Sign out · en')).toBeInTheDocument();

    open();
    act(() => fireEvent.click(item('Español (Argentina)')));

    expect(screen.getByText('Cerrar sesión · es-AR')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es-AR');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es-AR');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('closes on Escape without changing anything, and gives focus back to the icon', () => {
    mountWithSelector('en');
    open();

    fireEvent.keyDown(item('English'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(screen.getByText('Sign out · en')).toBeInTheDocument();
  });

  it('closes on a click anywhere else', () => {
    mountWithSelector('en');
    open();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when the icon is pressed again', () => {
    mountWithSelector('en');
    open();
    open();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('moves between the languages with the arrow keys, Home and End, wrapping around', () => {
    mountWithSelector('en');
    open();

    fireEvent.keyDown(item('English'), { key: 'ArrowDown' });
    expect(item('Español (Argentina)')).toHaveFocus();
    fireEvent.keyDown(item('Español (Argentina)'), { key: 'ArrowDown' });
    expect(item('English')).toHaveFocus();
    fireEvent.keyDown(item('English'), { key: 'ArrowUp' });
    expect(item('Español (Argentina)')).toHaveFocus();
    fireEvent.keyDown(item('Español (Argentina)'), { key: 'Home' });
    expect(item('English')).toHaveFocus();
    fireEvent.keyDown(item('English'), { key: 'End' });
    expect(item('Español (Argentina)')).toHaveFocus();
  });

  it('opens from the keyboard with the arrow down, and chooses with Enter', () => {
    mountWithSelector('en');

    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeInTheDocument();

    act(() => fireEvent.click(item('Español (Argentina)')));
    expect(screen.getByText('Cerrar sesión · es-AR')).toBeInTheDocument();
  });

  it('closes when focus leaves with Tab', () => {
    mountWithSelector('en');
    open();

    fireEvent.keyDown(item('English'), { key: 'Tab' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('the language itself', () => {
  it('starts in the remembered language', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'es-AR');
    render(
      <LocaleProvider>
        <Greeting />
      </LocaleProvider>,
    );
    expect(screen.getByText('Cerrar sesión · es-AR')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es-AR');
  });

  it('starts in English with nothing remembered and an English browser', () => {
    render(
      <LocaleProvider>
        <Greeting />
      </LocaleProvider>,
    );
    expect(screen.getByText('Sign out · en')).toBeInTheDocument();
  });

  it('works without a provider, in English', () => {
    render(<Greeting />);
    expect(screen.getByText('Sign out · en')).toBeInTheDocument();
  });

  it('still works when the browser will not store anything', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
      configurable: true,
    });
    mountWithSelector('en');
    open();
    act(() => fireEvent.click(item('Español (Argentina)')));
    expect(screen.getByText('Cerrar sesión · es-AR')).toBeInTheDocument();
  });
});
