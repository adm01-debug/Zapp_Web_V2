import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const readJson = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));

const PINNED = 'name-and-file-pinned';
const WARNING = 'live-guard-warning-no-historical-content';
const PINNED_KIND = 'ledger-only/name-and-file-pinned';
// Secao "Quatro avisos formalizados" do LEDGER_LIMITACOES_HISTORICAS_2026-09-22.md.
// Os avisos nao entram no manifesto do guard (migration-evidence.json); por isso
// sao a unica lista fixada a mao aqui.
const FORMALIZED_WARNINGS = ['20260901000002', '20260902023200', '20260902023300', '20260907200000'];

/**
 * Regra do inventario informativo das limitacoes historicas:
 * 1) toda excecao `ledger-only/name-and-file-pinned` do manifesto do guard tem de
 *    estar inventariada, com filename e sha256 iguais aos do arquivo local real;
 * 2) os quatro avisos formalizados sao os unicos com a classe de aviso e nunca podem
 *    existir no manifesto do guard (isso os promoveria a excecao de confianca);
 * 3) nenhuma linha inventa hash historico (`historical_sql_sha256`).
 * A cobertura e DERIVADA do manifesto: contagem travada deixava o furo invisivel.
 */
function conferirInventario(report, exceptions) {
  assert.equal(report.historical_content_proven, false);

  const pinnedExceptions = exceptions.exceptions.filter(ex => ex.kind === PINNED_KIND);
  const reportedPinned = report.entries.filter(row => row.evidence_class === PINNED);
  const warnings = report.entries.filter(row => row.evidence_class === WARNING);
  assert.equal(report.entries.length, new Set(report.entries.map(row => row.version)).size, 'versao duplicada no inventario');
  assert.equal(report.entries.length, reportedPinned.length + warnings.length, 'classe de evidencia desconhecida no inventario');
  assert.deepEqual(reportedPinned.map(row => row.version).sort(), pinnedExceptions.map(ex => ex.version).sort());
  assert.deepEqual(reportedPinned.map(row => row.filename).sort(), pinnedExceptions.map(ex => ex.filename).sort());
  assert.deepEqual(warnings.map(row => row.version).sort(), [...FORMALIZED_WARNINGS].sort());
  assert.equal(report.entries.length, pinnedExceptions.length + FORMALIZED_WARNINGS.length, 'inventario incompleto ou inflado');

  for (const row of report.entries) {
    assert.match(row.filename, new RegExp(`^${row.version}_[a-z0-9_-]+\\.sql$`));
    const content = fs.readFileSync(new URL(`../../supabase/migrations/${row.filename}`, import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex'), row.local_file_sha256);
    assert.equal('historical_sql_sha256' in row, false, 'inventario nao pode declarar hash historico');
    if (row.evidence_class === PINNED) {
      const exception = exceptions.exceptions.find(ex => ex.version === row.version && ex.kind === PINNED_KIND);
      assert.ok(exception, `excecao ausente para ${row.version}`);
      assert.equal(exception.file_sha256, row.local_file_sha256);
    } else {
      assert.equal(row.evidence_class, WARNING);
      assert.equal(exceptions.exceptions.some(ex => ex.version === row.version), false, 'warning inventory must not silently create a trust exception');
    }
  }
}

/**
 * Inventario sintetico e COMPLETO montado a partir do manifesto do guard: os casos
 * adversariais abaixo partem dele para que a unica diferenca seja a mutacao de cada
 * teste (nao a pendencia do arquivo real, que tem o seu proprio teste).
 */
function inventarioSintetico() {
  const exceptions = readJson('./migration-evidence.json');
  const reais = readJson('./ledger-history-limitations.json');
  const avisos = reais.entries.filter(row => row.evidence_class === WARNING);
  const fixadas = exceptions.exceptions
    .filter(ex => ex.kind === PINNED_KIND)
    .map(ex => ({ version: ex.version, filename: ex.filename, local_file_sha256: ex.file_sha256, evidence_class: PINNED }));
  return { ...reais, entries: [...avisos, ...fixadas] };
}

test('the historical-limitations inventory covers every ledger-only pinned migration without manufacturing historical proof', () => {
  conferirInventario(readJson('./ledger-history-limitations.json'), readJson('./migration-evidence.json'));
});

test('inventory that omits a pinned limitation fails (adversarial)', () => {
  const exceptions = readJson('./migration-evidence.json');
  const completo = inventarioSintetico();
  assert.doesNotThrow(() => conferirInventario(completo, exceptions));
  const fixadas = completo.entries.filter(row => row.evidence_class === PINNED);
  const mutilado = { ...completo, entries: completo.entries.filter(row => row.version !== fixadas.at(-1).version) };
  assert.throws(() => conferirInventario(mutilado, exceptions), /Expected values to be strictly deep-equal/);
});

test('inventory with a duplicated limitation fails (adversarial)', () => {
  const exceptions = readJson('./migration-evidence.json');
  const completo = inventarioSintetico();
  const duplicado = { ...completo, entries: [...completo.entries, completo.entries[0]] };
  assert.throws(() => conferirInventario(duplicado, exceptions), /versao duplicada/);
});

test('a formalized warning promoted to trust exception fails (adversarial)', () => {
  const exceptions = readJson('./migration-evidence.json');
  const completo = inventarioSintetico();
  const promovido = { ...exceptions, exceptions: [...exceptions.exceptions, { version: FORMALIZED_WARNINGS[0], kind: 'ledger-divergence/pinned-replay' }] };
  assert.throws(() => conferirInventario(completo, promovido), /trust exception/);
});

test('an inventory row with a fabricated historical hash fails (adversarial)', () => {
  const exceptions = readJson('./migration-evidence.json');
  const completo = inventarioSintetico();
  const fabricado = { ...completo, entries: completo.entries.map((row, index) => (index === 0 ? { ...row, historical_sql_sha256: 'a'.repeat(64) } : row)) };
  assert.throws(() => conferirInventario(fabricado, exceptions), /hash historico/);
});

test('an inventory row whose sha256 does not match the local file fails (adversarial)', () => {
  const exceptions = readJson('./migration-evidence.json');
  const completo = inventarioSintetico();
  const adulterado = { ...completo, entries: completo.entries.map((row, index) => (index === 0 ? { ...row, local_file_sha256: 'b'.repeat(64) } : row)) };
  assert.throws(() => conferirInventario(adulterado, exceptions));
});
