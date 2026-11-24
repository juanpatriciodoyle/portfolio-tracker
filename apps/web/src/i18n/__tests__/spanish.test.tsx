import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import HeroMetrics from '../../components/HeroMetrics';
import AppHeader from '../../components/AppHeader';
import { LocaleProvider } from '../LocaleProvider';
import { setActiveLocale } from '../activeLocale';
import { translatorFor } from '../translate';
import { classifyApiError } from '../../lib/apiErrors';
import { ApiError } from '../../lib/apiClient';
import { serverMessage } from '../../lib/serverMessages';
import { greetingFor } from '../../lib/greeting';
import { formatMonths } from '../../lib/duration';
import { describePeriodWindow } from '../../lib/periodWindow';
import { heroSummary } from '../../lib/heroSummary';
import { catalogs } from '../catalogs';
import { INTERNAL_ERROR_MESSAGE, INVALID_REQUEST_MESSAGE, SIGN_IN_ERROR_CODES } from '../../contracts';

const useProfile = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useProfile', () => ({ useProfile }));

const es = translatorFor('es-AR');

afterEach(() => {
  cleanup();
  setActiveLocale(null);
  document.documentElement.lang = 'en';
});

const figures = {
  netWorth: 10000,
  realNetWorth: 9000,
  cashBalance: 1000,
  openMarketValue: 9000,
  openCostBasis: 8000,
  openProfit: 1000,
  realOpenProfit: 800,
  soldProfit: 0,
  realSoldProfit: 0,
  moneyPutIn: 8000,
  dividends: 0,
  totalFees: 0,
  totalGain: 1000,
  totalGainPercent: 12.5,
  pricesAvailable: true,
};

describe('the app in Argentine Spanish', () => {
  it('words the home figures in Spanish and formats them with a decimal comma', () => {
    render(
      <LocaleProvider initial="es-AR">
        <HeroMetrics figures={figures} period="All" periodGain={0} periodPercent={0} currency="EUR" isRealInflationMode={false} country="Spain" settled />
      </LocaleProvider>,
    );
    expect(screen.getByText('Valor total')).toBeInTheDocument();
    expect(screen.getAllByText('Ganancia total').length).toBeGreaterThan(0);
    expect(screen.getByText(/Dinero que pusiste: €\s?8\.000/)).toBeInTheDocument();
    expect(screen.getByText('Valor de tus tenencias')).toBeInTheDocument();
    expect(screen.getByText('desde que empezaste', { exact: false })).toBeInTheDocument();
    // 10.000 with a dot for thousands and no cents at that size, and the percentage with a comma
    expect(screen.getByRole('img', { name: /^€\s?10\.000$/ })).toBeInTheDocument();
    expect(screen.getByText('+12,50%')).toBeInTheDocument();
  });

  it('keeps the same figures in English the English way', () => {
    render(
      <LocaleProvider initial="en">
        <HeroMetrics figures={figures} period="All" periodGain={0} periodPercent={0} currency="EUR" isRealInflationMode={false} country="Spain" settled />
      </LocaleProvider>,
    );
    expect(screen.getByRole('img', { name: '€10,000' })).toBeInTheDocument();
    expect(screen.getByText('+12.50%')).toBeInTheDocument();
    expect(screen.getByText('Money you put in: €8,000')).toBeInTheDocument();
  });

  it('shows the header in Spanish, with a language selector', () => {
    useProfile.mockReturnValue({ status: 'ready', profile: null });
    render(
      <LocaleProvider initial="es-AR">
        <AppHeader isRealInflationMode={false} onToggleInflation={() => undefined} country="Spain" onOpenCountry={() => undefined} onLogTransaction={() => undefined} onOpenProfile={() => undefined} onSignOut={() => undefined} />
      </LocaleProvider>,
    );
    expect(screen.getByRole('button', { name: 'Registrar transacción' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ajustar por inflación' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    // the stored country is English data, shown in Spanish
    expect(screen.getByRole('button', { name: /España/ })).toBeInTheDocument();
    // The language is an icon that opens a menu: the current one is ticked inside it, and the button names it in Spanish.
    const languageButton = within(screen.getByRole('banner')).getByRole('button', { name: 'Idioma' });
    fireEvent.click(languageButton);
    expect(screen.getByRole('menuitemradio', { name: 'Español (Argentina)' })).toHaveAttribute('aria-checked', 'true');
  });

  it('words the pure helpers in Spanish when given the Spanish translator', () => {
    expect(greetingFor(9, es)).toBe('Buenos días');
    expect(greetingFor(14, es)).toBe('Buenas tardes');
    expect(greetingFor(22, es)).toBe('Buenas noches');
    expect(formatMonths(14, es)).toBe('1 año y 2 meses');
    expect(formatMonths(1, es)).toBe('1 mes');
    expect(formatMonths(0.3, es)).toBe('menos de un mes');
    expect(describePeriodWindow({ startDate: new Date(2026, 0, 1), endDate: new Date(2026, 10, 11) }, 'es-AR')).toMatch(/^1 ene\.? – 11 (de )?nov\.?( de)? 2026$/);
    expect(heroSummary({ figures, period: '1Y', periodGain: 5, periodPercent: 1, isRealInflationMode: false }, es).gain.phrase).toBe('en el último año');
  });
});

describe('what the server says, in Spanish', () => {
  const spanish = { t: es, locale: 'es-AR' as const };

  it('translates the answers it recognises', () => {
    expect(serverMessage({ error: 'x', code: 'DUPLICATE_BILLING_RECORD' }, spanish, 'error.notCompleted')).toBe('Esta factura ya está registrada.');
    expect(serverMessage({ error: 'x', code: 'INSUFFICIENT_CASH', currency: 'EUR', availableMinor: 25050 }, spanish, 'tx.notRecorded')).toMatch(/^Tenés €\s?250,50 en efectivo y esta compra necesita más\. Destildá "Pagar con efectivo"/);
    expect(serverMessage({ error: 'x', code: 'INSUFFICIENT_CASH', currency: 'EUR', availableMinor: 0 }, spanish, 'tx.notRecorded')).toMatch(/^No tenés efectivo en EUR/);
    expect(serverMessage({ error: 'x', code: 'INSUFFICIENT_HOLDINGS', availableUnits: 3 }, spanish, 'tx.notRecorded')).toBe('Podés vender como máximo 3 unidades de este activo.');
    expect(serverMessage({ error: 'x', code: 'INSUFFICIENT_HOLDINGS', availableUnits: 0 }, spanish, 'tx.notRecorded')).toBe('No tenés este activo en esa fecha, así que no se puede vender.');
    expect(serverMessage({ error: catalogs.en['error.registrationClosed'], code: 'REGISTRATION_CLOSED' }, spanish, 'error.notCompleted')).toBe(catalogs['es-AR']['error.registrationClosed']);
    expect(serverMessage({ error: catalogs.en['error.tooManySignIns'], code: 'TOO_MANY_ATTEMPTS' }, spanish, 'error.notCompleted')).toBe('Demasiados intentos de inicio de sesión. Esperá un momento y probá de nuevo.');
    expect(serverMessage({ error: 'x', code: 'PASSKEY_NOT_FOR_ADMIN' }, spanish, 'error.notCompleted')).toBe('Esta cuenta solo inicia sesión con Google.');
  });

  it('has Spanish words for every refusal the server can send when signing in, saving a passkey or starting the demo', () => {
    for (const code of SIGN_IN_ERROR_CODES) {
      const words = serverMessage({ error: 'x', code }, spanish, 'error.notCompleted');
      expect(words, code).not.toBe(es('error.notCompleted'));
      expect(words, code).not.toBe('x');
    }
  });

  it('falls back to a generic Spanish message for an answer it does not know', () => {
    expect(serverMessage({ error: 'Something only the server knows' }, spanish, 'login.googleFailed')).toBe('No se pudo iniciar sesión con Google.');
    expect(serverMessage(null, spanish, 'error.notCompleted')).toBe('No se pudo completar. Revisá los datos y probá de nuevo.');
  });

  it('keeps the server sentence in English', () => {
    expect(serverMessage({ error: 'Something only the server knows' }, { t: translatorFor('en'), locale: 'en' }, 'login.googleFailed')).toBe('Something only the server knows');
  });

  it('knows the sentences the server really sends', () => {
    expect(catalogs.en['error.server']).toBe(INTERNAL_ERROR_MESSAGE);
    expect(catalogs.en['error.invalidRequest']).toBe(INVALID_REQUEST_MESSAGE);
  });

  it('words a failed call in Spanish', () => {
    expect(classifyApiError(new ApiError(401, 'x', { error: 'x' }), spanish).message).toBe('Se cerró tu sesión. Iniciá sesión de nuevo para continuar.');
    expect(classifyApiError(new ApiError(500, 'x', { error: INTERNAL_ERROR_MESSAGE }), spanish).message).toBe(catalogs['es-AR']['error.server']);
    expect(classifyApiError(new ApiError(404, 'x', { error: 'Not found.' }), spanish).message).toBe('No se encontró. Puede que se haya eliminado desde otro lado.');
    expect(classifyApiError(new ApiError(429, 'x', null), spanish).message).toBe(catalogs['es-AR']['error.tooManyAttempts']);
    expect(classifyApiError(new TypeError('failed'), spanish).message).toBe('No se pudo conectar con el servidor. Revisá tu conexión y probá de nuevo.');
  });

  it('words a failed call in the language chosen on screen when none is given', () => {
    setActiveLocale('es-AR');
    expect(classifyApiError(new TypeError('failed')).message).toBe('No se pudo conectar con el servidor. Revisá tu conexión y probá de nuevo.');
    setActiveLocale('en');
    expect(classifyApiError(new TypeError('failed')).message).toBe('Could not reach the server. Check your connection and try again.');
  });
});
