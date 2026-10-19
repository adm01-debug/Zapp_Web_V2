// GA04: garante separação stdout/stderr nos scripts do db-migrate.
//
// validate-runtime-proof.mjs: stdout deve conter SOMENTE o hash SHA-256 de
// 64 caracteres hexadecimais + '\n'. Qualquer mensagem informativa deve ir
// para stderr — senão o bash não consegue capturar CONFIRMATION_HASH limpo.
//
// run-runtime-contract.mjs: stdout deve ser SOMENTE o JSON bruto da prova
// (repassado de r.stdout). Diagnósticos devem usar console.error (stderr).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const VALIDAR = join(RAIZ, 'scripts/db-audit/validate-runtime-proof.mjs');
const EXECUTAR = join(RAIZ, 'scripts/db-audit/run-runtime-contract.mjs');

test('GA04: validate-runtime-proof — só um process.stdout.write e ele emite o hash', () => {
  const src = readFileSync(VALIDAR, 'utf8');

  // Deve haver exatamente 1 process.stdout.write — o do hash de confirmação.
  const stdoutWrites = [...src.matchAll(/process\.stdout\.write/g)];
  assert.equal(
    stdoutWrites.length,
    1,
    `GA04: validate-runtime-proof.mjs tem ${stdoutWrites.length} process.stdout.write (esperado 1)`,
  );

  // O único write deve incluir a variável confirmacao seguida de '\n'.
  assert.ok(
    /process\.stdout\.write\(confirmacao\s*\+\s*['"]\\n['"]\)/.test(src),
    "GA04: validate-runtime-proof.mjs — process.stdout.write não escreve `confirmacao + '\\n'`",
  );
});

test('GA04: validate-runtime-proof — hash de 64 chars é verificado antes de sair', () => {
  const src = readFileSync(VALIDAR, 'utf8');

  // O módulo confirm-hash compõe o hash; o código valida o runtime_sha256 com regex antes.
  assert.ok(
    src.includes('/^[a-f0-9]{64}$/'),
    'GA04: validate-runtime-proof.mjs perdeu a verificação /^[a-f0-9]{64}$/ do runtime_sha256',
  );
});

test('GA04: validate-runtime-proof — mensagens informativas vão para stderr', () => {
  const src = readFileSync(VALIDAR, 'utf8');

  // A descrição do hash de confirmação deve ir para stderr.
  assert.ok(
    /process\.stderr\.write\(modHash\.descreverConfirmacao/.test(src),
    'GA04: validate-runtime-proof.mjs — descreverConfirmacao não vai para stderr',
  );

  // O informe do contrato genérico também deve ir para stderr.
  assert.ok(
    /process\.stderr\.write\(.*Contrato gen/.test(src),
    "GA04: validate-runtime-proof.mjs — aviso 'Contrato generico' não vai para stderr",
  );
});

test('GA04: validate-runtime-proof — sem console.log (contaminaria stdout)', () => {
  const src = readFileSync(VALIDAR, 'utf8');

  // console.log vai para stdout e quebraria a captura do CONFIRMATION_HASH.
  assert.ok(
    !src.includes('console.log('),
    'GA04: validate-runtime-proof.mjs tem console.log — contamina o stdout do hash',
  );
});

test('GA04: run-runtime-contract — stdout é somente o JSON bruto da prova', () => {
  const src = readFileSync(EXECUTAR, 'utf8');

  // Deve haver exatamente 1 process.stdout.write — o repasse de r.stdout.
  const stdoutWrites = [...src.matchAll(/process\.stdout\.write/g)];
  assert.equal(
    stdoutWrites.length,
    1,
    `GA04: run-runtime-contract.mjs tem ${stdoutWrites.length} process.stdout.write (esperado 1)`,
  );

  assert.ok(
    /process\.stdout\.write\(r\.stdout\)/.test(src),
    'GA04: run-runtime-contract.mjs — process.stdout.write não repassa r.stdout',
  );
});

test('GA04: run-runtime-contract — diagnósticos usam console.error (stderr)', () => {
  const src = readFileSync(EXECUTAR, 'utf8');

  // Erros fatais (versão inválida, arquivo ausente, falha de spawn) devem ir para stderr.
  const erros = [...src.matchAll(/console\.error/g)];
  assert.ok(
    erros.length >= 3,
    `GA04: run-runtime-contract.mjs tem apenas ${erros.length} console.error — diagnósticos podem estar em stdout`,
  );
});

test('GA04: run-runtime-contract — sem console.log (contaminaria o JSON da prova)', () => {
  const src = readFileSync(EXECUTAR, 'utf8');

  assert.ok(
    !src.includes('console.log('),
    'GA04: run-runtime-contract.mjs tem console.log — contamina o JSON da prova no stdout',
  );
});
