/**
 * W26/W21: testes unitários de lote-pendente.mjs.
 * Verifica que:
 * 1. Exit 0 do drift-script → exit 0 e summary "sem drift"
 * 2. Exit 1 do drift-script → exit 1 e summary "drift real"
 * 3. Exit 2 do drift-script → exit 2 e summary "apply aguardado"
 * 4. Exit 3 do drift-script → exit 3 e summary "falha de infraestrutura"
 * 5. GITHUB_STEP_SUMMARY é escrito quando definido
 * 6. O lote-pendente.mjs real é executado (não uma réplica da sua lógica)
 * 7. db-live-guard.yml e types-sync.yml chamam lote-pendente.mjs
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

/** Executa lote-pendente.mjs de verdade, com um drift-script simulado. */
function runWithMock(mockExitCode, summaryPath, { mockFonte } = {}) {
  // O script comparado é substituído por DRIFT_SCRIPT; o lote-pendente.mjs real
  // é executado, então a classificação dos exit codes é a de produção.
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lote-test-'));
  const mockScript = path.join(tmpDir, 'mock-check-migration-drift.mjs');
  const argvFile = path.join(tmpDir, 'argv.txt');
  writeFileSync(
    mockScript,
    '#!/usr/bin/env node\n'
    + (mockFonte || '')
    + 'import { writeFileSync } from "node:fs";\n'
    + 'if (process.env.MOCK_ARGV_FILE) writeFileSync(process.env.MOCK_ARGV_FILE, process.argv.slice(2).join("\\n"));\n'
    + `process.exitCode = ${mockExitCode};\n`,
    { mode: 0o700 },
  );

  const env = { ...process.env, DESTINO_URL: 'postgres://tester@fixture.invalid/test', DRIFT_SCRIPT: mockScript, MOCK_ARGV_FILE: argvFile };
  if (summaryPath) env.GITHUB_STEP_SUMMARY = summaryPath;
  else delete env.GITHUB_STEP_SUMMARY;

  const res = spawnSync(process.execPath, [LOTE_SCRIPT], { env, encoding: 'utf8', cwd: REPO_ROOT });
  return {
    exitCode: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
    argvRepassado: readFileSync(argvFile, 'utf8').split('\n').filter(Boolean),
  };
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

test('W26: exit 2 escreve summary "apply aguardado"', () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lote-sum-'));
  const summaryPath = path.join(tmpDir, 'summary.md');
  writeFileSync(summaryPath, '');
  const { exitCode } = runWithMock(2, summaryPath);
  const summary = readFileSync(summaryPath, 'utf8');
  assert.equal(exitCode, 2, 'exit 2 esperado');
  assert.ok(summary.includes('apply aguardado'), `Summary deve conter "apply aguardado"; got: ${summary}`);
});

test('W26: sem GITHUB_STEP_SUMMARY nao falha', () => {
  const { exitCode } = runWithMock(0, undefined);
  assert.equal(exitCode, 0, 'exit 0 esperado sem summary path');
});

// Falha de infraestrutura (leitura de migrations / consulta ao ledger) não é
// apply pendente: se saísse 2, db-live-guard trataria como neutro em push e
// types-sync pularia os gates, deixando o CI verde com o banco inacessível.
test('W21: exit 3 escreve summary "falha de infraestrutura" e propaga 3', () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lote-sum-'));
  const summaryPath = path.join(tmpDir, 'summary.md');
  writeFileSync(summaryPath, '');
  const { exitCode } = runWithMock(3, summaryPath);
  const summary = readFileSync(summaryPath, 'utf8');
  assert.equal(exitCode, 3, 'exit 3 esperado');
  assert.ok(
    summary.includes('falha de infraestrutura'),
    `Summary deve conter "falha de infraestrutura"; got: ${summary}`,
  );
  assert.ok(
    !summary.includes('apply aguardado'),
    'Summary de infra nao deve ser confundido com apply pendente',
  );
});

test('W26: lote-pendente repassa --classificar ao comparador', () => {
  const { argvRepassado } = runWithMock(0, undefined);
  assert.deepEqual(argvRepassado, ['--classificar'], 'o comparador precisa rodar em modo --classificar');
});

test('W26: script real exit 0 sem DESTINO_URL (so valida local)', () => {
  const { exitCode, stderr } = runReal(undefined);
  assert.equal(exitCode, 0, `Script real deveria sair 0 sem DESTINO_URL; stderr=${stderr}`);
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
