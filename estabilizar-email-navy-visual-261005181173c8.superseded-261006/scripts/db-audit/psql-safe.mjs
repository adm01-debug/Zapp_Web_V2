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

// E66 (auditoria de GitHub Actions, 2026-10-01): o psql sai com codigo 2 quando
// NAO CONSEGUE CONECTAR (o manual do psql reserva 2 para "bad connection"; 1 e'
// erro de SQL). Sem sinalizar isso, a politica de retry compartilhada de
// psql-environment.mjs nunca disparava para este chamador: o callback devolvia o
// exit code em vez de lancar, entao PSQL_CONNECT_RETRIES=2 no preflight do
// db-migrate.yml nao tinha efeito e uma oscilacao do pooler derrubava o passo de
// primeira. O sinal e' booleano de proposito: a regra do modulo e' nunca ecoar
// stderr, que pode conter a URI da conexao.
const EXIT_FALHA_CONEXAO = 2;

let result;
try {
  result = withPsqlEnvironment(url, env => {
    const r = spawnSync(PSQL_BIN, args, { stdio: 'inherit', env });
    if (r.status === EXIT_FALHA_CONEXAO) {
      throw Object.assign(new Error('psql: falha de conexao (exit 2)'), { transporte: true });
    }
    return r;
  });
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
