import { describe, expect, it } from 'vitest';

/** Source text of files next to the tests, read through Vite so no Node types are needed. */
const read = (files: Record<string, string>) =>
  Object.entries(files).map(([path, source]) => ({ name: path.split('/').pop() ?? path, source }));

const componentFiles = read(
  import.meta.glob<string>('../*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
);
const hookFiles = read(import.meta.glob<string>('../../../hooks/*.ts', { query: '?raw', import: 'default', eager: true }));

describe('the profile view keeps to its layers', () => {
  it('finds the files it is meant to guard', () => {
    expect(componentFiles.length).toBeGreaterThan(15);
    expect(hookFiles.length).toBeGreaterThan(3);
  });

  it.each(componentFiles.map(({ name }) => [name]))('%s does not fetch, use storage, or touch the API client', (name) => {
    const source = componentFiles.find((file) => file.name === name)!.source;

    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/lib\/apiClient/);
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });

  it('only the data hooks reach for the API client', () => {
    const users = hookFiles.filter(({ source }) => /lib\/apiClient/.test(source)).map(({ name }) => name);

    expect(users.sort()).toEqual(['useBenchmarks.ts', 'useBillingRecords.ts', 'useDocumentExtraction.ts', 'useLivingPhases.ts', 'useProfile.ts', 'useSecondSalary.ts', 'useTrends.ts']);
  });
});

// Vitest replaces every .css import with an empty module, so profile.css itself is checked by grep, not here.
describe('the profile components take their colours from the tokens', () => {
  const hardcoded = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

  it.each(componentFiles.filter(({ name }) => name.endsWith('.tsx')).map(({ name }) => [name]))('%s has no literal colours', (name) => {
    const source = componentFiles.find((file) => file.name === name)!.source;

    expect(source).not.toMatch(hardcoded);
  });
});
