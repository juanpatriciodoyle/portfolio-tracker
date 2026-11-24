import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLESHEETS = ['index.css', 'components/wizard/dialog.css', 'components/profile/profile.css'];

describe('focus is shown as a border, never an outline', () => {
  it.each(STYLESHEETS)('%s draws no outline ring', (file) => {
    const css = readFileSync(join(__dirname, '..', file), 'utf8');
    expect(css).not.toMatch(/outline:\s*\d+px\s+solid/);
    expect(css).not.toMatch(/outline-offset/);
  });

  it('a box holding a bare input shows the border on the box only', () => {
    const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8');
    expect(css).toMatch(/\.money-field:focus-within\s*\{[^}]*border-color/);
    expect(css).toMatch(/\.money-field__input:focus-visible[^{]*\{[^}]*box-shadow:\s*none/);
  });
});
