#!/usr/bin/env node
/**
 * Proxy transparente para psql: nunca poe a connection string no argv
 * (visivel via `ps`/logs de processo do runner) nem no environment do
 * processo filho como DESTINO_URL. Usa withPsqlEnvironment() -- o mesmo
 * transporte ja usado por check-triple-parity.mjs e types-sync.yml.
 *
 * Uso: substitui `psql "$DESTINO_URL" <flags>` por
 *      `node scripts/db-audit/psql-safe.mjs <flags>`
 * stdin/stdout/stderr e o exit code sao repassados sem alteracao, entao
 * heredocs (`<<'SQL'`), `-c "..."`, `-f arquivo.sql` e captura via
 * `$(...)`/`>` continuam funcionando exatamente como antes.
 */
import { spawnSync } from 'node:child_process';
import { withPsqlEnvironment } from './psql-environment.mjs';

const url = process.env.DESTINO_URL;
if (!url) {
  console.error('ERRO: DESTINO_URL nao definido no ambiente.');
  process.exit(2);
}

const PSQL_BIN = process.env.PSQL_BIN || 'psql';
const args = process.argv.slice(2);

let result;
try {
  result = withPsqlEnvironment(url, env =>
    spawnSync(PSQL_BIN, args, { stdio: 'inherit', env }));
} catch (error) {
  console.error('ERRO: ' + error.message);
  process.exit(2);
}

if (result.error) {
  console.error('ERRO ao executar psql: ' + result.error.message);
  process.exit(1);
}
if (result.signal) {
  console.error('ERRO: psql encerrado pelo sinal ' + result.signal);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
