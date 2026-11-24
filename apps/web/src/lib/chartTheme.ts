/**
 * The chart is drawn on a canvas, which cannot read `var(--token)`: this reads the same tokens the rest of the
 * interface uses, so a colour is defined once, in the stylesheet.
 */
export const CHART_THEME_TOKENS = {
  grid: '--chart-grid-line',
  axisText: '--chart-axis-text',
  zeroLine: '--chart-zero-line',
  crosshair: '--chart-crosshair',
  markerRing: '--chart-marker-ring',
  costLine: '--chart-line-cost',
  benchmarkLine: '--color-benchmark',
  portfolioLine: '--chart-line-portfolio',
  profitLine: '--color-profit',
  portfolioArea: '--chart-area-portfolio',
  profitArea: '--chart-area-profit',
} as const;

/** The text on the chart's axes: the smallest text size of the interface (`--text-xs`, 13px), which a canvas cannot read from the stylesheet. */
export const CHART_FONT = '13px Inter, system-ui, sans-serif';

export type ChartTheme = Record<keyof typeof CHART_THEME_TOKENS, string>;

interface StyleReader {
  getPropertyValue(name: string): string;
}

/** A canvas ignores an invalid colour and keeps the previous one: the text colour is the safe thing to show instead. */
const MISSING = 'currentColor';

/** Pure: the theme as a style reader reports it. */
export function readChartTheme(style: StyleReader): ChartTheme {
  const entries = Object.entries(CHART_THEME_TOKENS).map(([key, token]) => [key, style.getPropertyValue(token).trim() || MISSING]);
  return Object.fromEntries(entries) as ChartTheme;
}

/** Shell: the theme of the page as it is now. */
export function chartThemeFromDocument(): ChartTheme {
  return readChartTheme(getComputedStyle(document.documentElement));
}
