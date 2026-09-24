#!/usr/bin/env node
/**
 * Substituto seguro de `supabase gen types typescript --db-url "$DESTINO_URL"`
 * (chamado por gen-types.sh). A URL original com credencial NUNCA chega ao
 * argv do processo `supabase`: a senha e injetada via PGPASSFILE (mesmo
 * mecanismo de psql-safe.mjs para o psql), e o --db-url passado ao binario
 * supabase e reconstruido SEM senha a partir dos campos ja validados e
 * allow-listados por withPsqlEnvironment (host/porta/database/user/
 * sslmode/sslrootcert) -- nenhuma logica de parse/validacao de URL nova e
 * introduzida aqui, tudo delega para psql-environment.mjs.
 *
 * pgx (driver Go usado pelo Supabase CLI) documenta em ParseConfig o
 * reconhecimento de PGPASSFILE e o fallback para .pgpass quando a URL nao
 * tem senha (pkg.go.dev/github.com/jackc/pgx/v5/pgconn). Nao foi possivel
 * validar isso executando o supabase CLI de verdade neste sandbox (sem o
 * binario/conectividade com o banco) -- a primeira validacao real e o
 * proprio db-live-guard/types-sync rodando apos o merge.
 *
 * Uso: node scripts/db-audit/gen-types-safe.mjs [output_path]
 * Requer: DESTINO_URL no ambiente; binario `supabase` no PATH (ou
 * SUPABASE_BIN para testes).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { withPsqlEnvironment } from './psql-environment.mjs';

const OUTPUT = path.resolve(process.argv[2] || '/tmp/types.generated.ts');
const SUPABASE_BIN = process.env.SUPABASE_BIN || 'supabase';

const url = process.env.DESTINO_URL;
if (!url) {
  console.error('Erro: DESTINO_URL nao definida no ambiente.');
  process.exit(1);
}

function buildPasswordFreeDbUrl(env) {
  const user = encodeURIComponent(env.PGUSER || '');
  const host = env.PGHOST || '';
  const port = env.PGPORT || '5432';
  const database = encodeURIComponent(env.PGDATABASE || '');
  const params = new URLSearchParams();
  if (env.PGSSLMODE) params.set('sslmode', env.PGSSLMODE);
  if (env.PGSSLROOTCERT) params.set('sslrootcert', env.PGSSLROOTCERT);
  const query = params.toString();
  return `postgresql://${user}@${host}:${port}/${database}${query ? `?${query}` : ''}`;
}

// Porta fiel do awk original do gen-types.sh: linhas em branco sao contadas
// e so "liberadas" quando uma linha com conteudo vem depois -- ou seja,
// blanks finais (fim de arquivo) sao descartadas, mas a quantidade de blanks
// ENTRE linhas com conteudo e preservada (nao colapsada para uma so).
function normalizeBlankLines(text) {
  const hadTrailingNewline = text.endsWith('\n');
  const lines = text.split('\n');
  if (hadTrailingNewline) lines.pop();
  const out = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blankRun += 1;
    } else {
      while (blankRun > 0) {
        out.push('');
        blankRun -= 1;
      }
      out.push(line);
    }
  }
  return `${out.join('\n')}\n`;
}

let result;
try {
  result = withPsqlEnvironment(url, (env) => spawnSync(SUPABASE_BIN, [
    'gen', 'types', 'typescript',
    '--db-url', buildPasswordFreeDbUrl(env),
    '--schema', 'public',
  ], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 }));
} catch (error) {
  console.error(`Erro: ${error.message}`);
  process.exit(2);
}

if (result.error) {
  console.error(`Erro ao executar supabase: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`Erro: supabase encerrado pelo sinal ${result.signal}`);
  process.exit(1);
}
if (result.status !== 0) {
  const stderr = (result.stderr || '').toString().trim();
  console.error(`Erro: supabase gen types falhou (exit ${result.status})${stderr ? `: ${stderr}` : ''}`);
  process.exit(result.status === null ? 1 : result.status);
}

const normalized = normalizeBlankLines(result.stdout);
const temporary = `${OUTPUT}.tmp-${process.pid}`;
try {
  fs.writeFileSync(temporary, normalized, 'utf8');
  fs.renameSync(temporary, OUTPUT);
} finally {
  fs.rmSync(temporary, { force: true });
}
console.log(`types gerado: ${OUTPUT} (${Buffer.byteLength(normalized, 'utf8')} bytes)`);
