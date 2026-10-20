#!/usr/bin/env node
// Ratchet: fails CI if noImplicitAny error count grows above baseline.
// To tighten: fix errors, update baseline.json to the new lower count.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(__dirname, 'implicit-any-baseline.json');
const { baseline } = JSON.parse(readFileSync(baselinePath, 'utf8'));
const rootDir = join(__dirname, '../..');

let output = '';
try {
  output = execSync(
    'npx tsc -p tsconfig.app.json --noEmit --noImplicitAny 2>&1',
    { encoding: 'utf8', cwd: rootDir }
  );
} catch (err) {
  output = (err.stdout ?? '') + (err.stderr ?? '');
}

const count = (output.match(/error TS7/g) ?? []).length;
console.log(`implicit-any errors: ${count} (baseline: ${baseline})`);

if (count > baseline) {
  console.error(`\nERROR: ${count - baseline} new implicit-any error(s) introduced.`);
  console.error('Fix them or update scripts/ci/implicit-any-baseline.json.');
  process.exit(1);
}

if (count < baseline) {
  console.log(`\nGreat: ${baseline - count} error(s) eliminated.`);
  console.log(`Update scripts/ci/implicit-any-baseline.json to ${count} to tighten the ratchet.`);
}
