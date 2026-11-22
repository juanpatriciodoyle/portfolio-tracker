import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHART_THEME_TOKENS, readChartTheme } from '../chartTheme';

const styles = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

const reader = (values: Record<string, string>) => ({ getPropertyValue: (name: string) => values[name] ?? '' });

describe('readChartTheme', () => {
  it('reads every colour from its CSS variable, without the whitespace CSS leaves around it', () => {
    const everything = Object.fromEntries(Object.values(CHART_THEME_TOKENS).map((token) => [token, `  ${token}-value `]));
    const theme = readChartTheme(reader(everything));

    for (const [key, token] of Object.entries(CHART_THEME_TOKENS)) {
      expect(theme[key as keyof typeof theme]).toBe(`${token}-value`);
    }
  });

  it('falls back to the text colour for a variable that is not defined, so a line is never invisible', () => {
    const theme = readChartTheme(reader({}));
    expect(new Set(Object.values(theme))).toEqual(new Set(['currentColor']));
  });
});

describe('the chart tokens', () => {
  it.each(Object.values(CHART_THEME_TOKENS))('%s is defined in the stylesheet', (token) => {
    expect(styles).toMatch(new RegExp(`^\\s*${token}\\s*:`, 'm'));
  });
});
