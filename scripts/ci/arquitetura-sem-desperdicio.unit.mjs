/**
 * Contratos da arquitetura sem desperdício (docs/ci/ARQUITETURA_SEM_DESPERDICIO.md).
 *
 * Cada regra nasceu de um desperdício MEDIDO em 15/10/2026 (100 runs de CI em ~36 h,
 * ~1.000 min). Este arquivo existe para que a volta de qualquer um deles quebre o
 * check obrigatório "Lint & TypeCheck" em vez de passar despercebida.
 *
 *   R1  fila serial: o auto-update atualiza no máximo UMA PR por execução.
 *   R2  reuso de árvore: no push da main, nenhum job pesado roda se a árvore já
 *       foi aprovada na PR (8 de 9 pushes repetiam a mesma árvore).
 *   R3  a suíte de unidade roda uma vez: cobertura sai dos shards, nunca de uma
 *       segunda rodada (14 min em série na main).
 *   R4  nada espera o que não consome: o Build não depende dos testes.
 *   R5  run cancelado não pinta check obrigatório de vermelho (!cancelled(), não always()).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const CI = ler('.github/workflows/ci.yml');
const DB_GUARD = ler('.github/workflows/db-guard.yml');
const AUTO_UPDATE = ler('.github/workflows/auto-update-pr-branch.yml');
const VITEST = ler('vitest.config.ts');
const semComentarios = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/** Jobs do workflow: { id: { bloco, needs: string[], if: string|null } }. */
function jobs(texto) {
  const corpo = texto.slice(texto.indexOf('\njobs:\n') + 7);
  const partes = corpo.split(/\n(?=  [A-Za-z0-9_-]+:\s*$)/m);
  const saida = {};
  for (const parte of partes) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/m.exec(parte);
    if (!m) continue;
    const needsLinha = /^ {4}needs:\s*(.+?)\s*$/m.exec(parte);
    const needs = needsLinha ? needsLinha[1].replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean) : [];
    const se = /^ {4}if:\s*(.+?)\s*(#.*)?$/m.exec(parte);
    saida[m[1]] = { bloco: parte, needs, if: se ? se[1] : null };
  }
  return saida;
}

const JOBS_CI = jobs(CI);
const JOBS_DB = jobs(DB_GUARD);
// Jobs que não precisam do reuso: o próprio reuso e o que só roda em PR.
const ISENTOS = { ci: new Set(['reuso', 'mutation-mapa']), db: new Set(['reuso']) };

test('parser enxerga os jobs reais (o contrato não passa por não achar nada)', () => {
  for (const id of ['reuso', 'lint-and-typecheck', 'unit-test-shard', 'test', 'build', 'security', 'e2e']) {
    assert.ok(JOBS_CI[id], `ci.yml sem o job ${id}`);
  }
  for (const id of ['reuso', 'offline-contract-core', 'offline-contract-talkx', 'offline-contract-multiplix-ia-team', 'offline-contract']) {
    assert.ok(JOBS_DB[id], `db-guard.yml sem o job ${id}`);
  }
});

test('R1: o auto-update escolhe pela fila e atualiza no máximo uma PR', () => {
  const t = semComentarios(AUTO_UPDATE);
  assert.match(t, /node scripts\/ci\/fila-merge\.mjs/, 'a escolha tem de passar pela fila testada');
  assert.doesNotMatch(t, /for pr in/, 'laço sobre várias PRs = voltou o O(N²) de 15/10');
  assert.equal((t.match(/update-branch"/g) ?? []).length, 1, 'uma única chamada de update-branch, para a PR escolhida');
  assert.match(t, /if: steps\.fila\.outputs\.pr != ''/, 'sem PR escolhida, nada é atualizado');
});

for (const [nome, lista, isentos, workflow] of [
  ['ci.yml', JOBS_CI, ISENTOS.ci, 'ci.yml'],
  ['db-guard.yml', JOBS_DB, ISENTOS.db, 'db-guard.yml'],
]) {
  test(`R2: ${nome} — todo job pesado depende do reuso e é dispensado quando a árvore já foi aprovada`, () => {
    const reuso = lista.reuso;
    assert.equal(reuso.if, "github.event_name == 'push'", 'o reuso só existe no push (em PR não ocupa runner)');
    assert.match(reuso.bloco, new RegExp(`reuso-arvore\\.mjs --workflow ${workflow.replace('.', '\\.')}`), 'o reuso consulta o próprio workflow');
    const faltando = Object.entries(lista)
      .filter(([id]) => !isentos.has(id))
      .filter(([, j]) => !j.needs.includes('reuso') || !/needs\.reuso\.outputs\.reusar != 'true'/.test(j.if ?? ''))
      .map(([id]) => id);
    assert.deepEqual(faltando, [], `jobs que refariam árvore já aprovada no push da main: ${faltando.join(', ')}`);
  });

  test(`R5: ${nome} — nenhum job usa always(); cancelado não pinta check de vermelho`, () => {
    const comAlways = Object.entries(lista).filter(([, j]) => /always\(\)/.test(j.if ?? '')).map(([id]) => id);
    assert.deepEqual(comAlways, [], `jobs com always(): ${comAlways.join(', ')} — use !cancelled()`);
  });
}

test('R3: a suíte de unidade roda uma vez — cobertura nos shards, piso só no agregador', () => {
  const t = semComentarios(CI);
  assert.doesNotMatch(t, /test:coverage/, 'segunda rodada da suíte só para cobertura voltou');
  const execucoes = t.match(/vitest run[^\n]*/g) ?? [];
  assert.deepEqual(
    execucoes.map((l) => l.trim()),
    [
      'vitest run --shard=${{ matrix.shard }}/3 --coverage --reporter=default --reporter=blob',
      'vitest run --merge-reports --coverage',
    ],
    'o vitest só pode rodar nos shards e no merge dos blobs',
  );
  assert.match(JOBS_CI['unit-test-shard'].bloco, /VITEST_SHARD_SEM_PISO: '1'/, 'shard sem piso (metade da suíte nunca alcança o piso)');
  assert.match(VITEST, /process\.env\.VITEST_SHARD_SEM_PISO === "1" \? undefined :/, 'o config precisa honrar a variável dos shards');
  assert.ok(JOBS_CI.test.needs.includes('unit-test-shard'), 'o agregador junta os shards');
});

test('R4: o Build não espera job cujo resultado não consome', () => {
  assert.deepEqual(JOBS_CI.build.needs, ['reuso'], `Build depende de: ${JOBS_CI.build.needs.join(', ')}`);
  assert.deepEqual(JOBS_CI.e2e.needs, ['reuso']);
  assert.deepEqual(JOBS_CI.security.needs, ['reuso']);
});
