import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/branch-hygiene-audit.yml', import.meta.url),
  'utf8',
);

test('auditoria semanal executa a verificacao informativa da toolchain', () => {
  assert.match(workflow, /^\s+schedule:\s*$/mu);
  assert.match(workflow, /^\s+run: node scripts\/ci\/bump-toolchain\.mjs\s*$/mu);
});
