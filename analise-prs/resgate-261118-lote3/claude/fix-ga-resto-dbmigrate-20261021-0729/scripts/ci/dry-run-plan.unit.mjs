// E63: o dry-run do Supabase CLI tem a saida lida e conferida contra o alvo
// autorizado. Antes disso o passo rodava o dry-run e descartava o texto -- o
// dry-run nao provava nada.
//
// As fixtures abaixo NAO sao inventadas: reproduzem a saida real do CLI
// registrada em supabase/cli#776 ("DRY RUN: migrations will *not* be pushed to
// the database." + "Would push migration <arquivo>.sql..."). A forma de lista
// aparece em material da Supabase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDryRunPlan, avaliarPlanoDoDryRun, avaliarPlanoDoDryRunApplyAll } from '../db-audit/dry-run-plan.mjs';

const CABECALHO = 'DRY RUN: migrations will *not* be pushed to the database.';
const ALVO = '20261001120000';

const SAIDA_UMA = [
  CABECALHO,
  `Would push migration ${ALVO}_minha_mudanca.sql...`,
  '',
].join('\n');

const SAIDA_DUAS = [
  CABECALHO,
  `Would push migration ${ALVO}_minha_mudanca.sql...`,
  'Would push migration 20261001130000_outra_mudanca.sql...',
  '',
].join('\n');

const workflow = await readFile(new URL('../../.github/workflows/db-migrate.yml', import.meta.url), 'utf8');

test('E63: le a saida real do CLI (uma migration)', () => {
  const { cabecalhoReconhecido, migracoes } = parseDryRunPlan(SAIDA_UMA);
  assert.equal(cabecalhoReconhecido, true);
  assert.equal(migracoes.length, 1);
  assert.equal(migracoes[0].version, ALVO);
  assert.equal(migracoes[0].nome, 'minha_mudanca');
});

test('E63: duas versions anunciadas → recusa (o caso da etapa)', () => {
  const r = avaliarPlanoDoDryRun({ texto: SAIDA_DUAS, esperado: ALVO });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /anunciou 2 migrations/);
  assert.match(r.motivo, /20261001130000/, 'o motivo nomeia o que sobrou');
});

test('E63: alvo diferente do autorizado → recusa', () => {
  const r = avaliarPlanoDoDryRun({ texto: SAIDA_UMA, esperado: '20260999999999' });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /alvo autorizado/);
});

test('E63: alvo exato → aceita', () => {
  const r = avaliarPlanoDoDryRun({ texto: SAIDA_UMA, esperado: ALVO });
  assert.equal(r.ok, true);
  assert.equal(r.migracoes[0].version, ALVO);
});

test('E63: saida inesperada nunca passa em silencio', () => {
  for (const texto of ['', 'Pushing migration x.sql...', 'DRY RUN: migrations will *not* be pushed to the database.']) {
    const r = avaliarPlanoDoDryRun({ texto, esperado: ALVO });
    assert.equal(r.ok, false, `deveria recusar: ${JSON.stringify(texto)}`);
  }
  const semCabecalho = avaliarPlanoDoDryRun({ texto: `Would push migration ${ALVO}_a.sql...`, esperado: ALVO });
  assert.equal(semCabecalho.ok, false);
  assert.match(semCabecalho.motivo, /nao reconhecida/);
});

test('E63: a forma de lista tambem e lida', () => {
  const texto = [CABECALHO, `Would push these migrations: ${ALVO}_a.sql`].join('\n');
  const r = avaliarPlanoDoDryRun({ texto, esperado: ALVO });
  assert.equal(r.ok, true);
});

test('E63: CLI 2.116 imprime a lista em linhas com marcador e e lida na ordem', () => {
  const texto = [CABECALHO, 'Connecting to remote database...', 'Would push these migrations:',
    ' \u2022 20261001110000_a.sql', ' \u2022 20261001120000_b.sql', 'Finished supabase db push.'].join('\n');
  const { cabecalhoReconhecido, migracoes } = parseDryRunPlan(texto);
  assert.equal(cabecalhoReconhecido, true);
  assert.deepEqual(migracoes.map((m) => m.version), ['20261001110000', '20261001120000']);
});

test('E63: linha com marcador fora da lista nao conta, e lista que nao termina em .sql e recusada', () => {
  const solta = [CABECALHO, ' \u2022 20261001120000_b.sql'].join('\n');
  assert.equal(parseDryRunPlan(solta).migracoes.length, 0);
  const estranha = [CABECALHO, 'Would push these migrations:', ' \u2022 rm -rf'].join('\n');
  assert.equal(parseDryRunPlan(estranha).migracoes.length, 0);
});

test('E63: bundle autorizado exige ordem estrita e presenca do alvo', () => {
  const crescente = [CABECALHO, `Would push migration ${ALVO}_a.sql...`, 'Would push migration 20261001130000_b.sql...'].join('\n');
  assert.equal(avaliarPlanoDoDryRun({ texto: crescente, esperado: ALVO, permitirBundle: true }).ok, true);

  const fora = [CABECALHO, 'Would push migration 20261001130000_b.sql...', `Would push migration ${ALVO}_a.sql...`].join('\n');
  const r1 = avaliarPlanoDoDryRun({ texto: fora, esperado: ALVO, permitirBundle: true });
  assert.equal(r1.ok, false);
  assert.match(r1.motivo, /fora de ordem/);

  const semAlvo = [CABECALHO, 'Would push migration 20261001130000_b.sql...'].join('\n');
  const r2 = avaliarPlanoDoDryRun({ texto: semAlvo, esperado: ALVO, permitirBundle: true });
  assert.equal(r2.ok, false);
  assert.match(r2.motivo, /nao inclui o alvo/);
});

test('E63: o passo do workflow le a saida do dry-run (pin)', () => {
  const passo = workflow.slice(
    workflow.indexOf('- name: Dry-run oficial do Supabase CLI'),
    workflow.indexOf('- name: Aplicar lote autorizado'),
  );
  assert.match(passo, /dry-run-plan\.mjs/, 'o parser tem de ser chamado');
  assert.match(passo, /tee /, 'a saida do CLI precisa ir para arquivo, senao nao ha o que conferir');
  assert.match(passo, /set -euo pipefail/, 'e o pipe com tee exige pipefail (F-02)');
  assert.match(passo, /--apply-all --esperados/, 'modo lote liga avaliarPlanoDoDryRunApplyAll (GA14)');
});

// W58: fixtures do modo apply_all_missing (W27) — lista ordenada, 1 faltando, 1 a mais.
const ESPERADOS_W58 = ['20261010100000', '20261010110000', '20261010120000'];

const SAIDA_APPLY_ALL = [
  CABECALHO,
  'Would push migration 20261010100000_a.sql...',
  'Would push migration 20261010110000_b.sql...',
  'Would push migration 20261010120000_c.sql...',
  '',
].join('\n');

test('W58: apply_all_missing lista ordenada exata passa', () => {
  const r = avaliarPlanoDoDryRunApplyAll({ texto: SAIDA_APPLY_ALL, esperados: ESPERADOS_W58 });
  assert.equal(r.ok, true);
  assert.equal(r.migracoes.length, 3);
});

test('W58: apply_all_missing com 1 arquivo faltando no dry-run recusa', () => {
  const textoFaltando = [
    CABECALHO,
    'Would push migration 20261010100000_a.sql...',
    'Would push migration 20261010120000_c.sql...',
    '',
  ].join('\n');
  const r = avaliarPlanoDoDryRunApplyAll({ texto: textoFaltando, esperados: ESPERADOS_W58 });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /faltando/, 'o motivo aponta o que falta');
  assert.match(r.motivo, /20261010110000/, 'nomeia a versao ausente');
});

test('W58: apply_all_missing com 1 arquivo a mais no dry-run recusa', () => {
  const textoExtra = [
    CABECALHO,
    'Would push migration 20261010100000_a.sql...',
    'Would push migration 20261010110000_b.sql...',
    'Would push migration 20261010115000_extra.sql...',
    'Would push migration 20261010120000_c.sql...',
    '',
  ].join('\n');
  const r = avaliarPlanoDoDryRunApplyAll({ texto: textoExtra, esperados: ESPERADOS_W58 });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /extra/, 'o motivo aponta o que sobrou');
  assert.match(r.motivo, /20261010115000/, 'nomeia a versao extra');
});

// GA14: o CLI --apply-all e o que o preflight invoca no modo lote.
test('GA14: CLI --apply-all aceita o conjunto exato e recusa divergencia', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'ga14-cli-'));
  try {
    const raiz = new URL('../../', import.meta.url).pathname;
    const arq = join(dir, 'dry.out');
    writeFileSync(arq, SAIDA_APPLY_ALL);
    const roda = (extra) =>
      spawnSync(process.execPath, ['scripts/db-audit/dry-run-plan.mjs', '--arquivo', arq, ...extra], {
        cwd: raiz,
        encoding: 'utf8',
      });
    assert.equal(roda(['--apply-all', '--esperados', ESPERADOS_W58.join(',')]).status, 0);
    const faltando = roda(['--apply-all', '--esperados', '20261010100000,20261010120000,20261010130000']);
    assert.equal(faltando.status, 1);
    assert.match(faltando.stderr, /Dry-run recusado/);
    assert.equal(roda(['--apply-all', '--esperados', '']).status, 2, 'sem esperados o uso e invalido');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
