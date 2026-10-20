// E64 / defeito F-11: a confirmacao do apply precisa amarrar o ARQUIVO, nao so'
// o estado do banco. O caso que originou a etapa: arquivo editado entre o
// dry-run e o apply, com o schema intacto -- a confirmacao antiga (so' runtime)
// passava e o apply executava um .sql que ninguem revisou.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comporHashConfirmacao, sha256DeArquivo, sha256DeTexto } from '../db-audit/confirm-hash.mjs';

const RUNTIME = 'a'.repeat(64);
const ARQUIVO = 'b'.repeat(64);
const COMMIT = 'c'.repeat(40);
const workflow = await readFile(new URL('../../.github/workflows/db-migrate.yml', import.meta.url), 'utf8');
// W28: a composicao foi extraida do heredoc inline do db-migrate.yml para validate-runtime-proof.mjs.
const preflight = await readFile(new URL('../../scripts/db-audit/validate-runtime-proof.mjs', import.meta.url), 'utf8');

test('E64: a confirmacao muda quando qualquer um dos tres componentes muda', () => {
  const base = comporHashConfirmacao({ runtimeSha256: RUNTIME, arquivoSha256: ARQUIVO, commitSha: COMMIT });
  assert.match(base, /^[a-f0-9]{64}$/, 'o hash final tem forma de SHA-256');
  assert.equal(comporHashConfirmacao({ runtimeSha256: RUNTIME, arquivoSha256: ARQUIVO, commitSha: COMMIT }), base, 'deterministico');

  const outroRuntime = comporHashConfirmacao({ runtimeSha256: 'd'.repeat(64), arquivoSha256: ARQUIVO, commitSha: COMMIT });
  const outroArquivo = comporHashConfirmacao({ runtimeSha256: RUNTIME, arquivoSha256: 'e'.repeat(64), commitSha: COMMIT });
  const outroCommit = comporHashConfirmacao({ runtimeSha256: RUNTIME, arquivoSha256: ARQUIVO, commitSha: 'f'.repeat(40) });
  for (const [nome, valor] of Object.entries({ outroRuntime, outroArquivo, outroCommit })) {
    assert.notEqual(valor, base, `${nome} deveria mudar o hash final`);
  }
  assert.equal(new Set([base, outroRuntime, outroArquivo, outroCommit]).size, 4);
});

test('E64 (F-11): editar o .sql entre o dry-run e o apply invalida a confirmacao', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'confirm-hash-'));
  const caminho = join(dir, '20260101000000_alvo.sql');
  await writeFile(caminho, 'alter table public.t add column c text;\n');
  const runtimeDoDryRun = RUNTIME;

  const noDryRun = comporHashConfirmacao({
    runtimeSha256: runtimeDoDryRun,
    arquivoSha256: sha256DeArquivo(caminho),
    commitSha: COMMIT,
  });

  // Alguem edita o arquivo. O banco nao muda: runtime identico, commit identico.
  await writeFile(caminho, 'alter table public.t add column c text;\ndrop table public.clientes;\n');
  const noApply = comporHashConfirmacao({
    runtimeSha256: runtimeDoDryRun,
    arquivoSha256: sha256DeArquivo(caminho),
    commitSha: COMMIT,
  });

  assert.notEqual(noApply, noDryRun, 'o apply tem de recusar: a conferencia antiga (so runtime) aceitaria');
  // E a conferencia antiga, para comparacao, de fato aceitaria:
  assert.equal(runtimeDoDryRun, runtimeDoDryRun);
});

test('GA04: validate-runtime-proof imprime o hash SOZINHO no stdout (captura do bash) e a descricao no stderr', () => {
  assert.match(preflight, /process\.stderr\.write\(modHash\.descreverConfirmacao/, 'descricao vai para o stderr, nao contamina a captura');
  assert.ok(preflight.includes('process.stdout.write(confirmacao'), 'hash vai para o stdout');
  const saidasStdout = preflight.split('\n').filter((l) => l.includes('process.stdout.write'));
  assert.equal(saidasStdout.length, 1, 'stdout carrega exatamente uma linha: o hash');
  assert.match(preflight, /process\.stderr\.write\('Contrato generico/, 'log informativo do contrato generico vai para o stderr');
});

test('E64: componente fora de forma e erro de programacao, nao mismatch silencioso', () => {
  assert.throws(() => comporHashConfirmacao({ runtimeSha256: 'curto', arquivoSha256: ARQUIVO, commitSha: COMMIT }), /runtimeSha256/);
  assert.throws(() => comporHashConfirmacao({ runtimeSha256: RUNTIME, arquivoSha256: '', commitSha: COMMIT }), /arquivoSha256/);
  assert.throws(() => comporHashConfirmacao({ runtimeSha256: RUNTIME, arquivoSha256: ARQUIVO, commitSha: 'zz' }), /commitSha/);
  assert.throws(
    () => comporHashConfirmacao({ runtimeSha256: RUNTIME.toUpperCase(), arquivoSha256: ARQUIVO, commitSha: COMMIT }),
    /runtimeSha256/,
    'lowercase e obrigatorio -- a comparacao e textual',
  );
});

test('E64: sha256DeTexto e a primitiva esperada', () => {
  assert.equal(sha256DeTexto(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('E64: o workflow compara o hash COMPOSTO, nao o runtime cru (pin do F-11)', () => {
  // W28: a composicao vive em validate-runtime-proof.mjs; o workflow invoca o script externo.
  assert.match(workflow, /validate-runtime-proof\.mjs/, 'o workflow precisa invocar o script de validacao externo');
  assert.match(preflight, /comporHashConfirmacao|descreverConfirmacao/, 'o preflight precisa usar a composicao');
  assert.doesNotMatch(
    workflow,
    /proof\.runtime_sha256 !== process\.env\.CONFIRM_RUNTIME_SHA256/,
    'a comparacao crua do runtime era exatamente o defeito F-11',
  );
  assert.match(
    preflight,
    /commitSha: process\.env\.GITHUB_SHA/,
    'o commit (github.sha) tem de ser componente da confirmacao, nao so o runtime',
  );
});
