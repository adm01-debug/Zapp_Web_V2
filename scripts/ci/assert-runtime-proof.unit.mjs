// GA16: a assercao de runtime pre-push extraida para assert-runtime-proof.mjs
// mantem a semantica do YAML original (mesmo fail-closed, mesmo exit 1).

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const SCRIPT = new URL('../db-audit/assert-runtime-proof.mjs', import.meta.url).pathname;
const RAIZ = new URL('../../', import.meta.url).pathname;
const RUNTIME = 'a'.repeat(64);

const PROVA_083017 = {
  server_major: 17,
  database: 'postgres',
  runtime_sha256: RUNTIME,
  function_count: 1,
  security_definer: true,
  stable: true,
  search_path_fixed: true,
  filters_active: true,
};

const roda = (proof, envExtra = {}) =>
  spawnSync(process.execPath, [SCRIPT], {
    cwd: RAIZ,
    encoding: 'utf8',
    env: {
      ...process.env,
      RUNTIME_JSON: JSON.stringify(proof),
      TARGET_VERSION: '20260830170000',
      NEEDS_APPLY: 'true',
      APPLY_BUNDLE: 'false',
      ...envExtra,
    },
  });

test('GA16: prova esperada passa', () => {
  assert.equal(roda(PROVA_083017).status, 0);
});

test('GA16: estado inesperado recusa com exit 1', () => {
  const r = roda({ ...PROVA_083017, function_count: 0 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Estado runtime inesperado/);
});

test('GA16: contrato generico continua aceito (fail-closed so para truncado)', () => {
  const generica = {
    contract: 'generic',
    server_major: 17,
    database: 'postgres',
    runtime_sha256: RUNTIME,
    table_count: 3,
    function_count: 0,
    policy_count: 1,
    ledger_count: 5,
    structure_sha256: RUNTIME,
  };
  assert.equal(roda(generica, { TARGET_VERSION: '20990101000000' }).status, 0);
  const truncada = { ...generica, ledger_count: 0 };
  assert.equal(roda(truncada, { TARGET_VERSION: '20990101000000' }).status, 1);
});

test('GA16: versao sem ramo e sem generico recusa (nunca vira "nada a verificar")', () => {
  const r = roda({ server_major: 17, database: 'postgres', runtime_sha256: RUNTIME }, { TARGET_VERSION: '20990101000000' });
  assert.equal(r.status, 1);
});
