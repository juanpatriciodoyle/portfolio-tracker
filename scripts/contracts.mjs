#!/usr/bin/env node
/**
 * The request/response contracts (Zod schemas) are written once, in apps/api/src/contracts.
 * The web app gets a generated, read-only mirror so both sides parse exactly the same shapes
 * while each app keeps building from its own folder (Docker contexts and CI jobs stay per app).
 *
 *   node scripts/contracts.mjs sync    regenerate apps/web/src/contracts
 *   node scripts/contracts.mjs check   exit 1 if the mirror has drifted (used by CI)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'apps/api/src/contracts');
const mirrorDir = join(root, 'apps/web/src/contracts');
const HEADER =
  '// GENERATED FILE: do not edit. Source of truth: apps/api/src/contracts. Run `npm run contracts:sync` at the repo root.\n';

const readTsFiles = (dir) =>
  new Map(
    existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => name.endsWith('.ts'))
          .sort()
          .map((name) => [name, readFileSync(join(dir, name), 'utf8')])
      : []
  );

const expected = new Map([...readTsFiles(sourceDir)].map(([name, content]) => [name, HEADER + content]));
const mode = process.argv[2];

if (mode === 'sync') {
  mkdirSync(mirrorDir, { recursive: true });
  for (const name of readTsFiles(mirrorDir).keys()) {
    if (!expected.has(name)) rmSync(join(mirrorDir, name));
  }
  for (const [name, content] of expected) writeFileSync(join(mirrorDir, name), content);
  console.log(`contracts: mirrored ${expected.size} files to apps/web/src/contracts`);
} else if (mode === 'check') {
  const actual = readTsFiles(mirrorDir);
  const drift = [
    ...[...expected.keys()].filter((name) => !actual.has(name)).map((name) => `missing in web mirror: ${name}`),
    ...[...actual.keys()].filter((name) => !expected.has(name)).map((name) => `stale in web mirror: ${name}`),
    ...[...expected].filter(([name, content]) => actual.has(name) && actual.get(name) !== content).map(([name]) => `out of date: ${name}`),
  ];
  if (drift.length > 0) {
    console.error(`contracts: web mirror has drifted\n  ${drift.join('\n  ')}\nRun \`npm run contracts:sync\` and commit the result.`);
    process.exit(1);
  }
  console.log(`contracts: web mirror is in sync (${expected.size} files)`);
} else {
  console.error('usage: node scripts/contracts.mjs <sync|check>');
  process.exit(2);
}
