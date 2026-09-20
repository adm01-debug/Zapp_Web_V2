#!/usr/bin/env node
/**
 * Gate de paridade tripla (E10 do plano 2026-09-20): consolida em um comando
 * as tres conferencias que a auditoria de 2026-09-16/17 fazia a mao.
 *
 *  A) migrations: count + md5 das versoes de supabase/migrations/*.sql
 *     contra supabase_migrations.schema_migrations (requer DESTINO_URL);
 *  B) edges: nomes em deployment-manifest.json .functions[] contra os
 *     diretorios reais de supabase/functions/ (sempre roda, local);
 *  C) grants: regenera o baseline via grants-baseline.sql no banco e compara
 *     com o grants-baseline.json commitado (requer DESTINO_URL).
 *
 * Sem DESTINO_URL as pernas A e C sao puladas com aviso (mesma semantica do
 * check-migration-drift.mjs). Qualquer divergencia => exit 1.
 *
 * Variaveis para testes offline:
 *   MIGRATIONS_DIR, FUNCTIONS_DIR, MANIFEST_PATH, GRANTS_SQL_PATH,
 *   GRANTS_BASELINE_PATH, PSQL_BIN (nunca passa por shell)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || 'supabase/migrations';
const FUNCTIONS_DIR = process.env.FUNCTIONS_DIR || 'supabase/functions';
const MANIFEST_PATH = process.env.MANIFEST_PATH || 'supabase/deployment-manifest.json';
const GRANTS_SQL_PATH = process.env.GRANTS_SQL_PATH || 'scripts/db-audit/grants-baseline.sql';
const GRANTS_BASELINE_PATH = process.env.GRANTS_BASELINE_PATH || 'scripts/db-audit/grants-baseline.json';
const PSQL_BIN = process.env.PSQL_BIN || 'psql';
const url = process.env.DESTINO_URL;

const FILE_NAME_RE = /^(\d{14})_[a-z0-9][a-z0-9_-]*\.sql$/;
let failures = 0;

function fail(msg) {
  failures += 1;
  console.error(`FALHA: ${msg}`);
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

function execPsqlSanitizado(args) {
  try {
    return execFileSync(PSQL_BIN, args, { encoding: 'utf8' });
  } catch (err) {
    // err.message do execFileSync embute a linha de comando (com DESTINO_URL);
    // relanca apenas o stderr do psql, truncado, sem credencial.
    const detalhe = (err.stderr || '').toString().slice(0, 300).trim();
    throw new Error(`psql falhou (exit ${err.status ?? '?'})${detalhe ? `: ${detalhe}` : ''}`);
  }
}

function psql(sql) {
  return execPsqlSanitizado([url, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql]);
}

function psqlFile(file) {
  return execPsqlSanitizado([url, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', file]);
}

// Ordena chaves recursivamente: a igualdade nao pode depender da ordem de
// serializacao (hoje ambos os lados saem de jsonb, que canonicaliza — este
// canon() imuniza contra edicao manual do baseline e mudanca futura de json).
function canon(valor) {
  if (Array.isArray(valor)) return valor.map(canon);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.keys(valor).sort().map((k) => [k, canon(valor[k])]));
  }
  return valor;
}

// ── A) migrations ↔ ledger ─────────────────────────────────────────────
function localVersions() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => FILE_NAME_RE.test(f))
    .map((f) => f.slice(0, 14))
    .sort();
}

function checkMigrations() {
  if (!url) {
    console.log('[migrations] pulado: DESTINO_URL ausente');
    return;
  }
  const locais = localVersions();
  const md5Local = md5(`${locais.join('\n')}\n`);
  const out = psql(
    "SELECT count(*) || '|' || md5(string_agg(version, E'\\n' ORDER BY version) || E'\\n') FROM supabase_migrations.schema_migrations",
  ).trim();
  const [countLedger, md5Ledger] = out.split('|');
  console.log(`[migrations] arquivos=${locais.length} ledger=${countLedger} md5_local=${md5Local} md5_ledger=${md5Ledger}`);
  if (String(locais.length) !== countLedger) {
    fail(`count divergente: ${locais.length} arquivos vs ${countLedger} no ledger`);
  }
  if (md5Local !== md5Ledger) {
    fail('md5 das versoes divergente entre arquivos e ledger');
  }
}

// ── B) edges: manifesto ↔ diretorios ───────────────────────────────────
function checkEdges() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const nomesManifesto = new Set((manifest.functions || []).map((f) => f.name));
  const dirs = new Set(
    fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => e.name),
  );
  const soManifesto = [...nomesManifesto].filter((n) => !dirs.has(n)).sort();
  const soDisco = [...dirs].filter((n) => !nomesManifesto.has(n)).sort();
  console.log(`[edges] manifesto=${nomesManifesto.size} diretorios=${dirs.size}`);
  if (soManifesto.length) fail(`edges so no manifesto: ${soManifesto.join(', ')}`);
  if (soDisco.length) fail(`edges so em disco (fora do manifesto): ${soDisco.join(', ')}`);
}

// ── C) grants baseline ─────────────────────────────────────────────────
function checkGrants() {
  if (!url) {
    console.log('[grants] pulado: DESTINO_URL ausente');
    return;
  }
  const fresco = JSON.parse(psqlFile(GRANTS_SQL_PATH));
  const commitado = JSON.parse(fs.readFileSync(GRANTS_BASELINE_PATH, 'utf8'));
  // generated_at embute a data da regeneracao (to_char(now(),...)) e mudaria
  // todo dia — o baseline compara apenas o conteudo de ACL.
  delete fresco.generated_at;
  delete commitado.generated_at;
  const a = JSON.stringify(canon(fresco));
  const b = JSON.stringify(canon(commitado));
  console.log(`[grants] fresco=${md5(a)} commitado=${md5(b)}`);
  if (a !== b) {
    fail(`grants-baseline desatualizado. Regenere: ${PSQL_BIN} "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At -f ${GRANTS_SQL_PATH} > ${GRANTS_BASELINE_PATH}`);
  }
}

// Erros inesperados (psql, JSON invalido) viram falha CONTROLADA da perna —
// o gate continua fail-closed, sem stack trace nem credencial no output.
for (const [nome, fn] of [['migrations', checkMigrations], ['edges', checkEdges], ['grants', checkGrants]]) {
  try {
    fn();
  } catch (err) {
    fail(`[${nome}] erro inesperado: ${err.message}`);
  }
}

if (failures > 0) {
  console.error(`Paridade tripla: ${failures} falha(s).`);
  process.exit(1);
}
console.log('OK: paridade tripla verificada.');
