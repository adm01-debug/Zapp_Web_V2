// GA14: hash do lote (lista ordenada + sha de cada arquivo + commit).
// Qualquer diferenca — versao a mais/menos, fora de ordem, arquivo editado,
// runtime diferente — muda o hash e o apply recusa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { comporHashLote } from '../db-audit/compose-confirm-hash.mjs';

const H = (c) => c.repeat(64);
const COMMIT = 'd7af7a671c'.padEnd(40, '0');

const LOTE = {
  versions: ['20261001120000', '20261001130000'],
  runtimeShas: [H('a'), H('b')],
  arquivoShas: [H('c'), H('d')],
  commitSha: COMMIT,
};

test('GA14: lote deterministico e em forma de sha256', () => {
  const h1 = comporHashLote(LOTE);
  const h2 = comporHashLote({ ...LOTE });
  assert.match(h1, /^[a-f0-9]{64}$/);
  assert.equal(h1, h2);
});

test('GA14: qualquer componente diferente muda o hash', () => {
  const base = comporHashLote(LOTE);
  const trocaArquivo = comporHashLote({ ...LOTE, arquivoShas: [H('c'), H('e')] });
  assert.notEqual(trocaArquivo, base, 'arquivo editado muda o hash');
  const trocaRuntime = comporHashLote({ ...LOTE, runtimeShas: [H('a'), H('f')] });
  assert.notEqual(trocaRuntime, base, 'runtime diferente muda o hash');
  const trocaCommit = comporHashLote({ ...LOTE, commitSha: '0'.repeat(40) });
  assert.notEqual(trocaCommit, base, 'commit diferente muda o hash');
});

test('GA14: versao a mais/menos ou fora de ordem nao compoe', () => {
  assert.throws(() => comporHashLote({ ...LOTE, versions: [] }), /lote vazio/);
  assert.throws(
    () => comporHashLote({ ...LOTE, versions: ['20261001120000'] }),
    /mesmo tamanho/,
  );
  assert.throws(
    () =>
      comporHashLote({
        ...LOTE,
        versions: ['20261001130000', '20261001120000'],
        runtimeShas: [H('b'), H('a')],
        arquivoShas: [H('d'), H('c')],
      }),
    /fora de ordem/,
    'mesmo conjunto fora de ordem recusa (o dry-run exige ordem estrita)',
  );
  assert.throws(
    () => comporHashLote({ versions: ['abc'], runtimeShas: [H('a')], arquivoShas: [H('c')], commitSha: COMMIT }),
    /fora de forma/,
  );
});

test('GA14: CLI imprime o mesmo hash da funcao', () => {
  const raiz = new URL('../../', import.meta.url).pathname;
  const r = spawnSync(
    process.execPath,
    [
      'scripts/db-audit/compose-confirm-hash.mjs',
      '--versions', LOTE.versions.join(','),
      '--runtime-shas', LOTE.runtimeShas.join(','),
      '--arquivo-shas', LOTE.arquivoShas.join(','),
      '--commit', COMMIT,
    ],
    { cwd: raiz, encoding: 'utf8' },
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), comporHashLote(LOTE));
  const ruim = spawnSync(
    process.execPath,
    ['scripts/db-audit/compose-confirm-hash.mjs', '--versions', 'abc', '--runtime-shas', H('a'), '--arquivo-shas', H('c'), '--commit', COMMIT],
    { cwd: raiz, encoding: 'utf8' },
  );
  assert.equal(ruim.status, 2);
});
