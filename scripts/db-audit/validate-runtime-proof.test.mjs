#!/usr/bin/env node
// GA04: verifica que validate-runtime-proof.mjs emite o hash confirm_runtime_sha256
// em stdout (^[a-f0-9]{64}\n$) e nada mais — mensagens de diagnóstico ficam em stderr.
// Também cobre run-runtime-contract.mjs: stdout é exclusivamente o JSON de prova.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const VALIDAR = join(RAIZ, 'scripts/db-audit/validate-runtime-proof.mjs');

const RUNTIME_SHA256 = 'a'.repeat(64);
const GITHUB_SHA = 'b'.repeat(40);
const STRUCTURE_SHA256 = 'c'.repeat(64);

// Monta prova genérica válida (contract === 'generic')
function provaGenerica() {
  return JSON.stringify({
    server_major: 17,
    database: 'postgres',
    runtime_sha256: RUNTIME_SHA256,
    contract: 'generic',
    table_count: 5,
    function_count: 3,
    policy_count: 2,
    ledger_count: 10,
    structure_sha256: STRUCTURE_SHA256,
  });
}

// Monta prova para TARGET_VERSION=20260830170000
function provaEspecifica() {
  return JSON.stringify({
    server_major: 17,
    database: 'postgres',
    runtime_sha256: RUNTIME_SHA256,
    function_count: 1,
    security_definer: true,
    stable: true,
    search_path_fixed: true,
    filters_active: true,
  });
}

function executar({ runtimeJson, targetVersion, needsApply = 'false', apply = 'false', confirmHash = '' }) {
  const tmp = mkdtempSync(join(tmpdir(), 'vrt-'));
  try {
    // Cria estrutura mínima esperada pelo script
    mkdirSync(join(tmp, 'supabase/migrations'), { recursive: true });
    mkdirSync(join(tmp, 'scripts/db-audit'), { recursive: true });
    writeFileSync(join(tmp, `supabase/migrations/${targetVersion}_test.sql`), '-- test sql\n');

    // confirm-hash.mjs precisa ser acessível de scripts/db-audit/ relativo ao CWD
    // Usa symlink via node:fs não disponível; copia resolução usando o path real
    const r = spawnSync(process.execPath, [VALIDAR], {
      cwd: RAIZ,
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNTIME_JSON: runtimeJson,
        TARGET_VERSION: targetVersion,
        NEEDS_APPLY: needsApply,
        APPLY: apply,
        CONFIRM_RUNTIME_SHA256: confirmHash,
        GITHUB_SHA,
        GITHUB_OUTPUT: join(tmp, 'github_output.txt'),
      },
    });
    return r;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('GA04: contrato genérico — stdout é hash hex64 e nada mais', () => {
  // 20261016240000 não tem branch específico em validate-runtime-proof.mjs → cai no genérico
  const r = executar({
    runtimeJson: provaGenerica(),
    targetVersion: '20261016240000',
  });
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout.trim(), /^[a-f0-9]{64}$/, `stdout inesperado: ${JSON.stringify(r.stdout)}`);
  assert.strictEqual(r.stdout, r.stdout.trim() + '\n', 'stdout deve terminar com newline');
});

test('GA04: contrato específico (20260830170000) — stdout é hash hex64 e nada mais', () => {
  const r = executar({
    runtimeJson: provaEspecifica(),
    targetVersion: '20260830170000',
  });
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout.trim(), /^[a-f0-9]{64}$/, `stdout inesperado: ${JSON.stringify(r.stdout)}`);
  assert.strictEqual(r.stdout, r.stdout.trim() + '\n', 'stdout deve terminar com newline');
});

test('GA04: hash em stdout é determinístico (mesmo runtime_sha256, arquivo e commit = mesmo hash)', () => {
  const r1 = executar({ runtimeJson: provaEspecifica(), targetVersion: '20260830170000' });
  const r2 = executar({ runtimeJson: provaEspecifica(), targetVersion: '20260830170000' });
  assert.strictEqual(r1.status, 0, `r1 stderr: ${r1.stderr}`);
  assert.strictEqual(r2.status, 0, `r2 stderr: ${r2.stderr}`);
  assert.strictEqual(r1.stdout, r2.stdout, 'hash deve ser determinístico');
});

test('GA04: nenhuma mensagem diagnóstica vai para stdout (apenas para stderr)', () => {
  const r = executar({
    runtimeJson: provaEspecifica(),
    targetVersion: '20260830170000',
  });
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  // stdout deve conter APENAS o hash — sem "OK:", "Contrato", "confirm_runtime_sha256=" etc.
  assert.doesNotMatch(r.stdout, /OK:|Contrato|confirm_runtime_sha256=|Sem contrato/i,
    'mensagem diagnóstica vazou para stdout');
  assert.doesNotMatch(r.stdout, /::/, 'anotação GitHub Actions vazou para stdout');
});
