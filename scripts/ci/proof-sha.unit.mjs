// GA14: extrator de runtime_sha256 (usado pelo provar-lote.sh).
// Fail-closed: prova invalida => exit 2, nunca string vazia.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const SCRIPT = ['scripts/db-audit/proof-sha.mjs'];
const RAIZ = new URL('../../', import.meta.url).pathname;
const RUNTIME = 'b'.repeat(64);

const roda = (entrada) =>
  spawnSync(process.execPath, SCRIPT, {
    cwd: RAIZ,
    encoding: 'utf8',
    input: entrada,
  });

test('GA14: proof-sha extrai o runtime_sha256', () => {
  const r = roda(JSON.stringify({ runtime_sha256: RUNTIME, table_count: 1 }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), RUNTIME);
});

test('GA14: proof-sha recusa prova sem sha (exit 2)', () => {
  for (const entrada of ['nao-json', '{}', JSON.stringify({ runtime_sha256: 'curto' })]) {
    const r = roda(entrada);
    assert.equal(r.status, 2, `deveria recusar: ${entrada}`);
    assert.equal(r.stdout, '', 'nada em stdout numa recusa');
  }
});
