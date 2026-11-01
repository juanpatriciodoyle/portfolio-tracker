import type { TrendsResponse, WindowAverageDto } from '../../contracts';
import { displayLocale, formatMinor } from '../../lib/money';

export interface WindowFigure {
  windowMonths: number;
  label: string;
  /** The average per month, or an em dash when no bill touches the window. */
  amount: string;
  /** Shown quietly under the figure when the window is only partly (or not at all) covered by bills. */
  hint: string | null;
}

export interface CurrencyTrend {
  currency: string;
  fixedCosts: WindowFigure[];
  subscriptions: WindowFigure[];
}

const NO_FIGURE = '—';

/** Wording for one window. The server already did the averaging: this only decides how to show it. */
export function describeWindow(window: WindowAverageDto, currency: string, locale: string = displayLocale()): WindowFigure {
  const covered = window.coveredMonths;
  return {
    windowMonths: window.windowMonths,
    label: `${window.windowMonths} months`,
    amount: window.averageMinor === null ? NO_FIGURE : formatMinor(window.averageMinor, currency, locale),
    hint:
      covered === 0
        ? 'no bills'
        : covered < window.windowMonths
          ? `based on ${covered} of ${window.windowMonths} months`
          : null,
  };
}

const figures = (windows: readonly WindowAverageDto[] | undefined, currency: string, locale: string) =>
  [...(windows ?? [])].sort((a, b) => a.windowMonths - b.windowMonths).map((window) => describeWindow(window, currency, locale));

/** One block per currency, in the order the server listed them, because amounts in different currencies never mix. */
export function groupTrendsByCurrency(trends: TrendsResponse, locale: string = displayLocale()): CurrencyTrend[] {
  const currencies = [...new Set([...trends.fixedCosts, ...trends.subscriptions].map((group) => group.currency))];
  return currencies.map((currency) => {
    const fixed = trends.fixedCosts.find((group) => group.currency === currency)?.windows;
    const subscriptions = trends.subscriptions.find((group) => group.currency === currency)?.windows;
    // A row the server left out has no bills behind it: same windows as its sibling, all dashes.
    const noBills = (windows: readonly WindowAverageDto[] | undefined): WindowAverageDto[] =>
      (windows ?? []).map((window) => ({ ...window, totalMinor: 0, coveredMonths: 0, averageMinor: null }));
    return {
      currency,
      fixedCosts: figures(fixed ?? noBills(subscriptions), currency, locale),
      subscriptions: figures(subscriptions ?? noBills(fixed), currency, locale),
    };
  });
}

/** True when at least one bill is behind any of the numbers. */
export function hasAnyBills(trends: TrendsResponse): boolean {
  const covered = [...trends.fixedCosts, ...trends.subscriptions].some((group) =>
    group.windows.some((window) => window.coveredMonths > 0)
  );
  return covered || trends.phases.some((phase) => phase.coveredMonths > 0);
}
