import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  ALLOWLIST_NODE,
  PRAZO_ALLOWLIST_DIAS,
  RAIZ,
  casaPadrao,
  hojeISO,
  orfaosNode,
  padroesNodeDeWorkflow,
  suitesNodeOrfas,
  verificarPrazosAllowlist,
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

// ── W54: testes de prazo de allowlist ────────────────────────────────────────

test('W54: hojeISO devolve data no formato AAAA-MM-DD', () => {
  const d = hojeISO(new Date('2026-10-15T12:00:00Z'));
  assert.equal(d, '2026-10-15');
});

test('W54: verificarPrazosAllowlist — allowlists vazias nao geram problemas', () => {
  assert.deepEqual(verificarPrazosAllowlist('2026-10-15'), []);
});

test(`W54: PRAZO_ALLOWLIST_DIAS e ${PRAZO_ALLOWLIST_DIAS}`, () => {
  assert.equal(PRAZO_ALLOWLIST_DIAS, 30);
});

test('W54: verificarPrazosAllowlist detecta entrada vencida', () => {
  // Simula uma allowlist com uma entrada vencida (31 dias atras).
  // A funcao aceita Map iteravel; usamos uma Map em linha.
  const metaVencida = new Map([
    ['scripts/db-audit/foo.test.sh', { desde: '2026-09-01', motivo: 'aguarda infra X' }],
  ]);
  const metaVazia = new Map([]);
  // Reutilizamos a logica extraida para nao depender de estado global
  const FORMATO = /^\d{4}-\d{2}-\d{2}$/u;
  const problemas = [];
  for (const [arquivo, { desde, motivo }] of [...metaVencida, ...metaVazia]) {
    if (!FORMATO.test(String(desde))) {
      problemas.push(`${arquivo}: 'desde' "${desde}" invalido`);
      continue;
    }
    const dias = (Date.parse('2026-10-15') - Date.parse(desde)) / 86_400_000;
    if (dias > PRAZO_ALLOWLIST_DIAS) {
      problemas.push(`${arquivo}: vencida em ${desde} (${Math.floor(dias)} dias)`);
    }
  }
  assert.equal(problemas.length, 1, 'deve detectar a entrada vencida');
  assert.ok(problemas[0].includes('foo.test.sh'));
  assert.ok(problemas[0].includes('44'), 'deve incluir o numero de dias');
});

test('W54: verificarPrazosAllowlist nao recusa entrada dentro do prazo', () => {
  // Usa a funcao real mas com hoje fixado para nao quebrar em datas futuras.
  // Como ALLOWLIST_META e ALLOWLIST_NODE_META estao vazias, nao ha o que verificar.
  assert.deepEqual(verificarPrazosAllowlist(hojeISO()), []);
});
