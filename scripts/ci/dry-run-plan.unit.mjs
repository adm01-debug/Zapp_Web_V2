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
import { parseDryRunPlan, avaliarPlanoDoDryRun } from '../db-audit/dry-run-plan.mjs';

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

test('lote: conjunto exato (3 versions, ordem certa) e aceito', () => {
  const lote = ['20261001120000', '20261001130000', '20261001140000'];
  const texto = [
    CABECALHO,
    ...lote.map((v) => `Would push migration ${v}_m.sql...`),
  ].join('\n');
  const r = avaliarPlanoDoDryRun({ texto, esperado: '20261001140000', esperados: lote });
  assert.equal(r.ok, true);
  assert.equal(r.migracoes.length, 3);
  // a lista tambem chega como csv/espacos (o workflow passa o output do preflight)
  const rCsv = avaliarPlanoDoDryRun({ texto, esperado: '20261001140000', esperados: lote.join(',') });
  assert.equal(rCsv.ok, true);
});

test('lote: version INTERMEDIARIA omitida e recusada e nomeada', () => {
  const texto = [
    CABECALHO,
    'Would push migration 20261001120000_a.sql...',
    'Would push migration 20261001140000_c.sql...',
  ].join('\n');
  const r = avaliarPlanoDoDryRun({
    texto,
    esperado: '20261001140000',
    esperados: '20261001120000,20261001130000,20261001140000',
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /lote autorizado/);
  assert.match(r.motivo, /20261001130000/, 'o motivo nomeia a version omitida');
});

test('lote: version fora do lote e recusada', () => {
  const texto = [
    CABECALHO,
    'Would push migration 20261001120000_a.sql...',
    'Would push migration 20261001130000_b.sql...',
    'Would push migration 20261001140000_c.sql...',
    'Would push migration 20261001150000_d.sql...',
  ].join('\n');
  const r = avaliarPlanoDoDryRun({
    texto,
    esperado: '20261001140000',
    esperados: '20261001120000,20261001130000,20261001140000',
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /lote autorizado/);
  assert.match(r.motivo, /20261001150000/, 'o motivo nomeia a version que sobrou');
});

test('lote: ordem trocada e recusada', () => {
  const texto = [
    CABECALHO,
    'Would push migration 20261001130000_b.sql...',
    'Would push migration 20261001120000_a.sql...',
    'Would push migration 20261001140000_c.sql...',
  ].join('\n');
  const r = avaliarPlanoDoDryRun({
    texto,
    esperado: '20261001140000',
    esperados: '20261001120000,20261001130000,20261001140000',
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /lote autorizado/);
});

test('E63: o passo do workflow le a saida do dry-run (pin)', () => {
  const passo = workflow.slice(
    workflow.indexOf('- name: Dry-run oficial do Supabase CLI'),
    workflow.indexOf('- name: Aplicar alvo unico ou bundle ordenado autorizado'),
  );
  assert.match(passo, /dry-run-plan\.mjs/, 'o parser tem de ser chamado');
  assert.match(passo, /tee /, 'a saida do CLI precisa ir para arquivo, senao nao ha o que conferir');
  assert.match(passo, /set -euo pipefail/, 'e o pipe com tee exige pipefail (F-02)');
});
