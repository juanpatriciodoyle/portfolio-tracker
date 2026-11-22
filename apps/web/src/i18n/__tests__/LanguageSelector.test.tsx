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

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: createMemoryStorage(), configurable: true });
});

afterEach(() => {
  cleanup();
  setActiveLocale(null);
  document.documentElement.lang = 'en';
});

describe('LanguageSelector', () => {
  it('names each language in its own words', () => {
    mountWithSelector('en');
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['English', 'Español (Argentina)']);
  });

  it('is labelled in the language of the screen', () => {
    mountWithSelector('en');
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
    act(() => fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es-AR' } }));
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toBeInTheDocument();
  });

  it('switches every word on screen, announces it in <html lang> and remembers the choice', () => {
    mountWithSelector('en');
    expect(screen.getByText('Sign out · en')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es-AR' } });

    expect(screen.getByText('Cerrar sesión · es-AR')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es-AR');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es-AR');
  });

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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es-AR' } });
    expect(screen.getByText('Cerrar sesión · es-AR')).toBeInTheDocument();
  });
});
