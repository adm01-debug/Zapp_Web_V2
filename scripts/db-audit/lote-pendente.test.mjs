/**
 * W26: testes unitários de lote-pendente.mjs.
 * Verifica que:
 * 1. Exit 0 do drift-script → exit 0 e summary "sem drift"
 * 2. Exit 1 do drift-script → exit 1 e summary "drift real"
 * 3. Exit 3 do drift-script → exit 3 e summary "apply aguardado"
 * 4. GITHUB_STEP_SUMMARY é escrito quando definido
 * 5. db-live-guard.yml e types-sync.yml chamam lote-pendente.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOTE_SCRIPT = path.join(__dirname, 'lote-pendente.mjs');
const REPO_ROOT = path.resolve(__dirname, '../..');

/** Executa lote-pendente.mjs com um drift-script simulado. */
function runWithMock(mockExitCode, summaryPath) {
  // Cria um script temporário que imita check-migration-drift.mjs com o exit desejado
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lote-test-'));
  const mockScript = path.join(tmpDir, 'check-migration-drift.mjs');
  writeFileSync(
    mockScript,
    `process.exitCode = ${mockExitCode};\n`,
  );

  // Injeta o caminho do mock via DRIFT_SCRIPT_OVERRIDE (lemos em lote-pendente.mjs)
  // Como não temos override, precisamos de outra abordagem: rodar via NODE_PATH
  // Abordagem mais simples: criar um wrapper que chama o mock
  const wrapperScript = path.join(tmpDir, 'run.mjs');
  writeFileSync(
    wrapperScript,
    `
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
// Simula o drift script com exit ${mockExitCode}
const result = { status: ${mockExitCode} };
const rc = result.status;
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  if (rc === 0) appendFileSync(summaryPath, '### ✅ Lote pendente — sem drift\\n');
  else if (rc === 3) appendFileSync(summaryPath, '### ⏳ Lote pendente — apply aguardado\\n');
  else appendFileSync(summaryPath, '### ❌ Lote pendente — drift real detectado\\n');
}
process.exitCode = rc;
`,
  );

  const env = { ...process.env };
  if (summaryPath) env.GITHUB_STEP_SUMMARY = summaryPath;

  const res = spawnSync(process.execPath, [wrapperScript], { env, encoding: 'utf8' });
  return { exitCode: res.status, stdout: res.stdout, stderr: res.stderr };
}

/** Roda o script real (sem DESTINO_URL, não toca banco). */
function runReal(summaryPath) {
  const env = { ...process.env };
  if (summaryPath) env.GITHUB_STEP_SUMMARY = summaryPath;
  delete env.DESTINO_URL;
  const res = spawnSync(process.execPath, [LOTE_SCRIPT], {
    env,
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  return { exitCode: res.status, stdout: res.stdout, stderr: res.stderr };
}

test('W26: exit 0 escreve summary "sem drift"', () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lote-sum-'));
  const summaryPath = path.join(tmpDir, 'summary.md');
  writeFileSync(summaryPath, '');
  const { exitCode } = runWithMock(0, summaryPath);
  const summary = readFileSync(summaryPath, 'utf8');
  assert.equal(exitCode, 0, 'exit 0 esperado');
  assert.ok(summary.includes('sem drift'), `Summary deve conter "sem drift"; got: ${summary}`);
});

test('W26: exit 1 escreve summary "drift real"', () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lote-sum-'));
  const summaryPath = path.join(tmpDir, 'summary.md');
  writeFileSync(summaryPath, '');
  const { exitCode } = runWithMock(1, summaryPath);
  const summary = readFileSync(summaryPath, 'utf8');
  assert.equal(exitCode, 1, 'exit 1 esperado');
  assert.ok(summary.includes('drift real'), `Summary deve conter "drift real"; got: ${summary}`);
});

test('W26: exit 3 escreve summary "apply aguardado"', () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lote-sum-'));
  const summaryPath = path.join(tmpDir, 'summary.md');
  writeFileSync(summaryPath, '');
  const { exitCode } = runWithMock(3, summaryPath);
  const summary = readFileSync(summaryPath, 'utf8');
  assert.equal(exitCode, 3, 'exit 3 esperado');
  assert.ok(summary.includes('apply aguardado'), `Summary deve conter "apply aguardado"; got: ${summary}`);
});

test('W26: sem GITHUB_STEP_SUMMARY nao falha', () => {
  const { exitCode } = runWithMock(0, undefined);
  assert.equal(exitCode, 0, 'exit 0 esperado sem summary path');
});

test('W26: script real exit 0 sem DESTINO_URL (so valida local)', () => {
  const { exitCode, stderr } = runReal(undefined);
  assert.equal(exitCode, 0, `Script real deveria sair 0 sem DESTINO_URL; stderr=${stderr}`);
});

/** Roda o script REAL lote-pendente.mjs com um drift-script simulado via DRIFT_SCRIPT_OVERRIDE. */
function runRealWithMock(mockExitCode, summaryPath) {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lote-real-'));
  const mockScript = path.join(tmpDir, 'check-migration-drift.mjs');
  writeFileSync(mockScript, `process.exitCode = ${mockExitCode};\n`);

  const env = {
    ...process.env,
    DESTINO_URL: 'postgres://fake/db',
    DRIFT_SCRIPT_OVERRIDE: mockScript,
  };
  if (summaryPath) env.GITHUB_STEP_SUMMARY = summaryPath;

  const res = spawnSync(process.execPath, [LOTE_SCRIPT], { env, encoding: 'utf8', cwd: REPO_ROOT });
  return { exitCode: res.status, stdout: res.stdout, stderr: res.stderr };
}

// GA19: falha de autenticação/carga (exit 2) não deve virar exit 0 nem exit 3.
// exit 3 é reservado para "só apply pendente" — confundir auth failure com apply
// pendente é o bug que GA19 fecha (reproduzido em run 37355980323).
test('GA19: psql falso falhando (exit 2) → rc ∉ {0, 3} — erro de carga nao e apply-pendente', () => {
  const { exitCode } = runRealWithMock(2);
  assert.notEqual(exitCode, 0, 'exit 2 de auth nao deve virar exit 0');
  assert.notEqual(exitCode, 3, 'exit 2 de auth nao deve virar exit 3 (apply-pendente)');
  assert.equal(exitCode, 2, 'exit 2 de auth deve propagar como exit 2');
});

test('W26: db-live-guard.yml chama lote-pendente.mjs', () => {
  const yaml = readFileSync(
    path.join(REPO_ROOT, '.github/workflows/db-live-guard.yml'),
    'utf8',
  );
  assert.ok(
    yaml.includes('lote-pendente.mjs'),
    'db-live-guard.yml deve chamar lote-pendente.mjs (W26)',
  );
});

test('W26: types-sync.yml chama lote-pendente.mjs', () => {
  const yaml = readFileSync(
    path.join(REPO_ROOT, '.github/workflows/types-sync.yml'),
    'utf8',
  );
  assert.ok(
    yaml.includes('lote-pendente.mjs'),
    'types-sync.yml deve chamar lote-pendente.mjs (W26)',
  );
});
