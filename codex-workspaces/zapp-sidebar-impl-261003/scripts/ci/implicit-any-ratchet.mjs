#!/usr/bin/env node
// Ratchet: fails CI if noImplicitAny error count grows above baseline.
// To tighten: fix errors, update baseline.json to the new lower count.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(__dirname, 'implicit-any-baseline.json');
const { baseline } = JSON.parse(readFileSync(baselinePath, 'utf8'));
const rootDir = join(__dirname, '../..');

// tsc local por caminho absoluto (node + node_modules/typescript/bin/tsc): nao
// passa por npx nem deixa o processo filho resolver o comando pelo PATH (S4036).
const tscEntry = join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');

let output = '';
try {
  output = execFileSync(
    process.execPath,
    [tscEntry, '-p', 'tsconfig.app.json', '--noEmit', '--noImplicitAny'],
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
