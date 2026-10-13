import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  ALLOWLIST_NODE,
  ALLOWLIST_SQL,
  RAIZ,
  casaPadrao,
  orfaosDoInventario,
  orfaosNode,
  orfaosSql,
  padroesNodeDeWorkflow,
  padroesSqlDeWorkflow,
  padroesSqlDosWorkflows,
  suitesNodeOrfas,
  suitesSqlNoDisco,
  suitesSqlOrfas,
} from './check-test-inventory.mjs';

// Workflow sintetico com as tres formas de bloco `run:` do repositorio: escalar dobrado
// (`>-`), literal (`|`) e de uma linha. Os caminhos fora de `run:` (nome da etapa, comentario
// solto) NAO podem contar como cobertura: senao um comentario bastaria para esconder a suite.
const WORKFLOW = [
  'name: ci',
  'jobs:',
  '  guards:',
  '    steps:',
  '      # scripts/qa/comentado.unit.mjs aparece em comentario, nao roda',
  '      - name: roda as suites de scripts/ci (scripts/qa/mencionada-no-nome.unit.mjs)',
  '        run: >-',
  '          node --test scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs',
  '          scripts/db-audit/crm-sync-outbox-contract.test.mjs',
  '      - name: roda um script de teste direto',
  '        run: node scripts/db-audit/psql-environment.integration.mjs',
  '      - name: bloco literal',
  '        run: |',
  '          node --test scripts/talkx/*.unit.mjs',
  '          # node --test scripts/qa/desligado-por-comentario.unit.mjs',
  '    outro-job:',
  '      steps: []',
].join('\n');

test('R2-INF-013: padroesNodeDeWorkflow le os blocos run (dobrado, literal e de uma linha)', () => {
  assert.deepEqual(padroesNodeDeWorkflow(WORKFLOW), [
    'scripts/ci/*.unit.mjs',
    'scripts/db-audit/crm-sync-outbox-contract.test.mjs',
    'scripts/db-audit/psql-environment.integration.mjs',
    'scripts/edge-deploy/*.unit.mjs',
    'scripts/talkx/*.unit.mjs',
  ]);
});

test('R2-INF-013: caminho citado fora de run (nome da etapa, comentario) nao cobre a suite', () => {
  const padroes = padroesNodeDeWorkflow(WORKFLOW);
  assert.equal(padroes.some((p) => p.includes('mencionada-no-nome')), false);
  assert.equal(padroes.some((p) => p.includes('comentado')), false);
  assert.equal(padroes.some((p) => p.includes('desligado-por-comentario')), false, 'passo comentado dentro do run: nao executa');
});

test('R2-INF-013: casaPadrao trata * como um nivel de diretorio e ** como qualquer nivel', () => {
  assert.equal(casaPadrao('scripts/ci/lint-ratchet.unit.mjs', 'scripts/ci/*.unit.mjs'), true);
  assert.equal(casaPadrao('scripts/qa/prova.unit.mjs', 'scripts/ci/*.unit.mjs'), false);
  assert.equal(casaPadrao('scripts/ci/sub/prova.unit.mjs', 'scripts/ci/*.unit.mjs'), false, '* nao atravessa /');
  assert.equal(casaPadrao('scripts/ci/sub/prova.unit.mjs', 'scripts/ci/**/*.unit.mjs'), true, '** atravessa /');
  assert.equal(
    casaPadrao('scripts/db-audit/crm-sync-outbox-contract.test.mjs', 'scripts/db-audit/crm-sync-outbox-contract.test.mjs'),
    true,
    'caminho exato casa',
  );
  assert.equal(casaPadrao('scripts/ci/lint-ratchet.mjs', 'scripts/ci/*.unit.mjs'), false, 'o glob pede .unit.mjs');
});

test('R2-INF-013: suite Node fora dos blocos run vira orfa — e a allowlist a absolve', () => {
  const suites = [
    'scripts/ci/lint-ratchet.unit.mjs',
    'scripts/qa/prova-visao-classificadores.unit.mjs',
  ];
  const padroes = padroesNodeDeWorkflow(WORKFLOW);
  assert.deepEqual(orfaosNode(suites, padroes, new Set()), ['scripts/qa/prova-visao-classificadores.unit.mjs']);
  assert.deepEqual(
    orfaosNode(suites, padroes, new Set(['scripts/qa/prova-visao-classificadores.unit.mjs'])),
    [],
  );
});

test('R2-INF-013: a arvore atual nao tem suite Node fora dos workflows nem da ALLOWLIST_NODE', () => {
  // Toda suite Node de scripts/ passa por aqui: ou um bloco `run:` a executa, ou ela esta
  // nomeada na ALLOWLIST_NODE. Sem isso, uma suite nova nasce sem passo nenhum e o
  // inventario continua dizendo OK — foi o defeito desta tarefa.
  assert.deepEqual(suitesNodeOrfas(), []);
});

test('R2-INF-013: a ALLOWLIST_NODE nao guarda entrada morta', () => {
  for (const arquivo of ALLOWLIST_NODE) {
    assert.ok(existsSync(join(RAIZ, arquivo)), `${arquivo} esta na ALLOWLIST_NODE mas nao existe no repositorio`);
  }
});

test('R2-INF-013: importar o verificador nao roda o inventario (o teste importa as funcoes)', () => {
  // Sem a guarda de modulo principal, o import roda a checagem e chama process.exit -- foi
  // o que fez este arquivo "passar" sem executar nenhuma assercao na primeira tentativa.
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./scripts/ci/check-test-inventory.mjs');"], {
    cwd: RAIZ,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '', 'importar nao pode imprimir o relatorio do inventario');
});

// ── t_fceba6d5: suítes SQL de supabase/tests/ e scripts/db-tests/ ─────────────
// Mesmo defeito que R2-INF-013 achou nas suites Node, agora nas .sql: elas existiam no
// disco, nenhum passo do CI as executava e o inventario nem olhava para o diretorio.
const WORKFLOW_SQL = [
  'name: db-guard',
  'jobs:',
  '  offline-contract:',
  '    steps:',
  '      # supabase/tests/comentada.sql so aparece em comentario, nao executa',
  '      - name: prova (supabase/tests/mencionada-no-nome.sql)',
  '        env:',
  '          SUITES: supabase/tests/so-no-env.sql',
  '        run: >-',
  '          bash scripts/db-audit/retry-disposable-postgres-test.sh',
  '          bash scripts/db-tests/run-suites-postgres.sh',
  '          supabase/tests/r2_db_022_provenance_trigger.sql',
  '      - name: glob',
  '        run: |',
  '          node scripts/db-tests/run-glob.mjs "scripts/db-tests/*.sql"',
  '          # scripts/db-tests/desligada-no-run.sql',
].join('\n');

test('t_fceba6d5: padroesSqlDeWorkflow le os blocos run e ignora comentario, nome de etapa e env', () => {
  assert.deepEqual(padroesSqlDeWorkflow(WORKFLOW_SQL), [
    'scripts/db-tests/*.sql',
    'supabase/tests/r2_db_022_provenance_trigger.sql',
  ]);
});

test('t_fceba6d5: suite SQL fora dos blocos run vira orfa — e a allowlist a absolve', () => {
  const suites = ['supabase/tests/a.sql', 'supabase/tests/b.sql'];
  const padroes = padroesSqlDeWorkflow(WORKFLOW_SQL);
  assert.deepEqual(orfaosSql(suites, padroes, new Set()), ['supabase/tests/a.sql', 'supabase/tests/b.sql']);
  assert.deepEqual(orfaosSql(suites, padroes, new Set(['supabase/tests/a.sql'])), ['supabase/tests/b.sql']);
});

test('t_fceba6d5: glob de suite SQL casa um nivel por * (supabase/tests/*.sql)', () => {
  assert.equal(casaPadrao('supabase/tests/x.sql', 'supabase/tests/*.sql'), true);
  assert.equal(casaPadrao('supabase/tests/sub/x.sql', 'supabase/tests/*.sql'), false);
});

test('t_fceba6d5: as duas suites SQL auto-contidas estao num bloco run: real do db-guard', () => {
  const padroes = padroesSqlDosWorkflows();
  for (const arquivo of [
    'supabase/tests/r2_db_022_provenance_trigger.sql',
    'supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql',
  ]) {
    assert.ok(padroes.includes(arquivo), `${arquivo} deveria estar num bloco run: de workflow`);
  }
});

test('t_fceba6d5: nenhuma suite SQL de supabase/tests ou scripts/db-tests esta orfa', () => {
  assert.deepEqual(suitesSqlOrfas(), []);
  assert.ok(suitesSqlNoDisco().length >= 16, 'as 16 suites SQL do disco devem entrar no inventario');
});

test('t_fceba6d5: nenhum orfao restante do inventario e uma suite SQL', () => {
  // O inventario pode ter orfaos .test.sh de outros cartoes (pre-existentes a esta
  // mudanca); o que esta tarefa garante e que a classe .sql nao tem orfao nenhum.
  assert.deepEqual(orfaosDoInventario().filter(o => o.file.endsWith('.sql')), []);
});

test('t_fceba6d5: a ALLOWLIST_SQL nao guarda entrada morta', () => {
  for (const arquivo of ALLOWLIST_SQL) {
    assert.ok(existsSync(join(RAIZ, arquivo)), `${arquivo} esta na ALLOWLIST_SQL mas nao existe no repositorio`);
  }
});
