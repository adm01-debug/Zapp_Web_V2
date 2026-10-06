import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Prova do defeito R2-GOV-004 / item #307 do BACKLOG_VERIFICADO:
// o validador de export do Supabase anunciava "✅ Destino validado com sucesso."
// depois de uma falha do comando de banco.
//
// Duas causas medidas no arquivo supabase-export/validate_destino.sh:
//  1. `if ! node "$PSQL_SAFE" ... | tee "$OUT"` — sem `set -o pipefail` o status do
//     pipeline é o do `tee` (sempre 0 quando ele escreve), então a falha do node/psql
//     era descartada; com 0 linhas FAIL no buffer, o script seguia e terminava em 0.
//  2. `node "$PSQL_SAFE" ... -o "$JSON_FILE"` (geração do JSON de validação) não tinha
//     checagem de status: falhava em silêncio e o script ainda anunciava sucesso.
//
// O teste nunca toca banco real: um `node` falso entra na frente na PATH e reproduz
// falha de conexão, falha de métrica, falha ao gravar o JSON e sucesso sintético.
// Nenhum psql, PostgreSQL, rede ou arquivo do repositório é usado como saída — os logs
// (EXPORT_LOG_JSON/EXPORT_LOG_CSV) e o stub ficam todos em diretório temporário.

const SCRIPT = fileURLToPath(new URL('../../supabase-export/validate_destino.sh', import.meta.url));

const NODE_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$AUDIT_EXPORT_STUB_TRACE"
mode="$AUDIT_EXPORT_STUB_MODE"
if [ "$mode" = "connection_error" ]; then
  printf 'psql: simulated connection failure\\n' >&2
  exit 42
fi
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
if [ -n "$out" ]; then
  if [ "$mode" = "json_error" ]; then
    printf 'psql: simulated failure writing validation JSON\\n' >&2
    exit 43
  fi
  printf '{"timestamp":"synthetic","metrics":[{"name":"tables","actual":1,"expected":1,"status":"OK"}]}' > "$out"
  exit 0
fi
if [ "$mode" = "metric_failure" ]; then
  printf '│ tables │ ❌ FAIL │\\n'
else
  printf '│ tables │ ✅ OK │\\n'
fi
exit 0
`;

const SUCESSO = 'Destino validado com sucesso';

function runScript(mode) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-destino-'));
  const stub = path.join(tmp, 'node');
  fs.writeFileSync(stub, NODE_STUB, { mode: 0o755 });
  const trace = path.join(tmp, 'trace.log');
  fs.writeFileSync(trace, '');
  const jsonFile = path.join(tmp, 'validation.json');
  const csvFile = path.join(tmp, 'validation.csv');

  const env = {
    ...process.env,
    PATH: `${tmp}${path.delimiter}${process.env.PATH ?? ''}`,
    DESTINO_URL: 'postgresql://audit-invalid.example/no-database',
    EXPORT_LOG_JSON: jsonFile,
    EXPORT_LOG_CSV: csvFile,
    AUDIT_EXPORT_STUB_MODE: mode,
    AUDIT_EXPORT_STUB_TRACE: trace,
  };
  delete env.BASH_ENV;
  delete env.ENV;
  delete env.SHELLOPTS;
  delete env.BASHOPTS;

  const result = spawnSync('bash', ['--noprofile', '--norc', SCRIPT], {
    encoding: 'utf8',
    env,
    timeout: 30000,
  });
  return { tmp, result, trace, jsonFile, csvFile };
}

test('falha do comando de banco (conexão) não pode anunciar sucesso nem sair 0', () => {
  const { result } = runScript('connection_error');
  assert.match(result.stdout, /simulated connection failure/);
  assert.doesNotMatch(result.stdout, new RegExp(SUCESSO));
  assert.notEqual(result.status, 0, `saiu ${result.status}: ${result.stdout}`);
  assert.match(result.stdout, /psql falhou/);
});

test('falha ao gerar o JSON de validação não pode anunciar sucesso nem sair 0', () => {
  const { result, jsonFile } = runScript('json_error');
  assert.doesNotMatch(result.stdout, new RegExp(SUCESSO));
  assert.notEqual(result.status, 0, `saiu ${result.status}: ${result.stdout}`);
  assert.equal(fs.existsSync(jsonFile), false);
});

test('controle: métrica ❌ FAIL continua saindo 1 sem anunciar sucesso', () => {
  const { result } = runScript('metric_failure');
  assert.match(result.stdout, /Validação FALHOU/);
  assert.doesNotMatch(result.stdout, new RegExp(SUCESSO));
  assert.equal(result.status, 1);
});

test('controle: validação bem-sucedida continua saindo 0 com JSON e CSV', () => {
  const { result, jsonFile, csvFile } = runScript('success');
  assert.equal(result.status, 0);
  assert.match(result.stdout, new RegExp(SUCESSO));
  assert.equal(fs.existsSync(jsonFile), true);
  assert.equal(fs.existsSync(csvFile), true);
});
