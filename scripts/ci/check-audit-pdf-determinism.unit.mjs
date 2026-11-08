import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./check-audit-pdf-determinism.mjs', import.meta.url));
const root = fileURLToPath(new URL('../..', import.meta.url));

test('PDF de auditoria permanece binariamente deterministico entre fusos', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /deterministic across 3 time zones/u);
});
