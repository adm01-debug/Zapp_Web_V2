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
import { JOB_REUSO } from './reuso-arvore.mjs';

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
    // Leitura por linha, sem regex com backtracking: valor = texto após "chave:",
    // sem o comentário final (" # ...").
    const valor = (chave) => {
      const linha = parte.split('\n').find((l) => l.startsWith(`    ${chave}:`));
      if (!linha) return null;
      const bruto = linha.slice(`    ${chave}:`.length);
      const comentario = bruto.indexOf(' #');
      return (comentario >= 0 ? bruto.slice(0, comentario) : bruto).trim();
    };
    const needsBruto = valor('needs');
    const needs = needsBruto ? needsBruto.replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean) : [];
    saida[m[1]] = { bloco: parte, needs, if: valor('if') };
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
  assert.doesNotMatch(t, /for pr in \$prs/, 'laço sobre todas as PRs BEHIND = voltou o O(N²) de 15/10');
  assert.doesNotMatch(t, /gh pr list/, 'a lista de PRs vem só da fila (fila-merge.mjs), nunca direto do workflow');
  assert.equal((t.match(/update-branch"/g) ?? []).length, 1, 'uma única chamada de update-branch no laço da fila');
  // O laço percorre a fila ordenada e PARA no primeiro update aceito: falha pula para
  // a próxima (sem travar a fila), sucesso encerra (no máximo uma PR por execução).
  const laco = t.slice(t.indexOf('for candidato in $FILA'), t.indexOf('done', t.indexOf('for candidato in $FILA')));
  assert.ok(laco.length > 0, 'o workflow itera sobre a fila ordenada');
  // Só a recusa permanente comprovada (403/422) avança; falha ambígua (update pode ter
  // sido aceito com 202) encerra, senão duas PRs entram em voo na mesma execução.
  assert.match(laco, /if ! grep -Eq 'HTTP \(403\|422\)'[^\n]*\n[^\n]*falha ambigua[^\n]*\n\s*exit 0/, 'sem 403/422, a falha é ambígua e encerra');
  assert.match(laco, /falha ambigua[^\n]*\n\s*exit 0/, 'falha ambígua encerra a execução');
  // 403/422 de rate limit ou "endpoint spam" é transitório: parar, não sondar a próxima (Codex, PR #1950).
  const antesDoContinue = laco.slice(0, laco.indexOf('continue'));
  assert.match(antesDoContinue, /grep -Eiq 'rate limit\|abuse\|spam'[^\n]*\n[^\n]*\n\s*exit 0/, 'rate limit/spam encerra antes de avançar');
  // 422 também é "nada a atualizar" (PR atualizada por fora depois da leitura da fila):
  // antes de avançar, relê a PR; se já está em dia com a main, ela é a PR em voo (Codex, PR #1950).
  const ramo422 = laco.slice(laco.indexOf("grep -q 'HTTP 422'"), laco.indexOf('continue'));
  assert.ok(ramo422.length > 0, 'o 422 é reconciliado antes do continue');
  assert.match(ramo422, /compare\/main\.\.\.\$sha_agora"? --jq '\.behind_by'/, 'o 422 relê o quanto a PR está atrás da main');
  assert.match(ramo422, /"\$atras" = "0" \][^\n]*\n[^\n]*\n\s*exit 0/, 'PR já em dia após 422 = em voo, encerra');
  assert.match(ramo422, /falha ao reler[^\n]*\n\s*exit 0/, '422 sem confirmação do estado encerra');
  // O 403/422 é o ÚNICO caminho que pula um candidato: falha ao ler o head (rede, 5xx)
  // não prova nada sobre a PR, e pular a cabeça da fila deixaria uma posterior entrar
  // antes dela, quebrando a ordem por enabledAt (Codex, PR #1950).
  assert.equal((laco.match(/\bcontinue\b/g) ?? []).length, 1, 'só a recusa 403/422 do update-branch avança na fila');
  assert.match(laco, /falha ao ler head[^\n]*\n\s*exit 0/, 'falha ao ler o head encerra a execução');
  assert.match(laco, /PR="\$candidato"\n\s*break/, 'o primeiro update aceito encerra o laço');
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
    // O script ignora o próprio job de reuso (sempre `skipped` em PR) pelo NOME: se o
    // nome divergir, o job pulado reprova todo run de PR e o reuso nunca dispara.
    assert.match(reuso.bloco, new RegExp(`^ {4}name: ${JOB_REUSO}$`, 'm'), `o job reuso precisa se chamar exatamente "${JOB_REUSO}"`);
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
