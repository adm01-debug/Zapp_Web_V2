#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolverCaminhoPermitido } from '../lib/seguranca-processo.mjs';
import { carregarIdentidadeEsperada, validarDestino, validarSupabaseCa, endurecerDestinoTls } from './database-identity.mjs';
import { withPsqlEnvironment } from './psql-environment.mjs';

const REALTIME_BASELINE_PATH = new URL('./realtime-publication-baseline.json', import.meta.url);

// S8707: o caminho de saida vem do argumento; nunca entra cru no writeFileSync.
// A guarda vive no modulo compartilhado (scripts/lib/seguranca-processo.mjs):
// resolve e exige que fique dentro do repositorio ou do diretorio temporario do
// sistema (as duas raizes legitimas para a evidencia gerada). Fail-closed: fora
// da raiz encerra com exit 2 (entrada invalida) sem tocar o banco.

/**
 * Contrato da baseline global da publicação (TC-014 / item #58). Exportado para a
 * guarda de regressão poder provar que a forma reduzida da branch em quarentena
 * (`team_chat_tables`, sem `schema_version`/`project_ref`/`tables`) é REJEITADA,
 * sem precisar trocar o arquivo real.
 */
export function validarBaselineRealtime(baseline) {
  if (baseline.schema_version !== 1
    || baseline.project_ref !== 'tnnnlkbymytvtqngbbqh'
    || baseline.publication !== 'supabase_realtime'
    || !Array.isArray(baseline.tables)) {
    throw new Error('Invalid Realtime publication baseline');
  }
  const tables = [...new Set(baseline.tables)];
  if (tables.length !== baseline.tables.length
    || tables.some(table => typeof table !== 'string' || !/^public\.[a-z][a-z0-9_]*$/.test(table))) {
    throw new Error('Invalid Realtime publication table list');
  }
  return tables.sort((a, b) => a.localeCompare(b));
}

export function loadRealtimeBaseline() {
  const baseline = JSON.parse(fs.readFileSync(REALTIME_BASELINE_PATH, 'utf8'));
  return validarBaselineRealtime(baseline);
}

/**
 * Escala de autovacuum esperada (S1244). O valor chega do Postgres como float,
 * então a igualdade exata `Number(x) !== 0.05` é frágil; compara-se com
 * tolerância (1e-9) — o mesmo resultado para o 0.05 real. Valor ausente ou não
 * numérico (NaN) continua contando como divergência (nada afrouxa aqui).
 */
function escalaAutovacuumOk(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && Math.abs(n - 0.05) <= 1e-9;
}

export function evaluateRuntimeConfig(raw, realtimeBaseline = loadRealtimeBaseline()) {
  const sections = raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const names = ['identity', 'autovacuum', 'realtime', 'cron', 'storage', 'ledger_limitations'];
  if (sections.length !== names.length || names.some(name => sections.filter(row => row.section === name).length !== 1)) {
    throw new Error('Missing or duplicate runtime sections');
  }
  const data = Object.fromEntries(sections.map(row => [row.section, row]));
  const failures = [];
  if (data.identity.database !== 'postgres' || data.identity.server_major !== 17) failures.push('database identity');
  if (data.autovacuum.enabled !== true) failures.push('global autovacuum disabled');
  const expected = ['messages', 'email_messages', 'email_threads', 'contacts'];
  for (const name of expected) {
    const tables = data.autovacuum.tables.filter(row => row.table === name);
    if (tables.length !== 1 || tables[0].enabled !== true
      || !escalaAutovacuumOk(tables[0].vacuum_scale_factor)
      || !escalaAutovacuumOk(tables[0].analyze_scale_factor)) failures.push(`autovacuum ${name}`);
  }
  const realtimeTables = Array.isArray(data.realtime.tables)
    ? data.realtime.tables.filter(table => typeof table === 'string').sort((a, b) => a.localeCompare(b))
    : [];
  if (data.realtime.publication_present !== true
    || realtimeTables.length !== data.realtime.tables?.length
    || new Set(realtimeTables).size !== realtimeTables.length
    || JSON.stringify(realtimeTables) !== JSON.stringify(realtimeBaseline)) {
    failures.push('realtime publication');
  }
  return {
    schema_version: 1, collected_at: new Date().toISOString(),
    project_ref: 'tnnnlkbymytvtqngbbqh', status: failures.length ? 'FAIL' : 'PARTIAL', failures,
    coverage: {
      autovacuum: failures.some(item => item.includes('autovacuum')) ? 'FAIL' : 'VERIFIED',
      realtime: failures.includes('realtime publication') ? 'FAIL' : 'VERIFIED', cron: data.cron.available ? 'COUNTS_ONLY' : 'UNAVAILABLE',
      storage: data.storage.available ? 'COUNTS_ONLY' : 'UNAVAILABLE',
      ledger: 'METADATA_ONLY_NO_HISTORICAL_CONTENT_PROOF', backups: 'NOT_VERIFIED_RESTORE_REQUIRED',
    }, sections,
  };
}

export function runRuntimeConfigAudit(outputPath) {
  let destinoSaida;
  try {
    destinoSaida = resolverCaminhoPermitido(outputPath, 'caminho de saida do runtime config');
  } catch (erro) {
    console.error('ERRO: ' + erro.message);
    process.exit(2);
  }
  const expected = carregarIdentidadeEsperada('scripts/db-audit/database-identity.json');
  const errors = [...validarDestino(process.env.DESTINO_URL, expected), ...validarSupabaseCa()];
  const tls = endurecerDestinoTls(process.env.DESTINO_URL);
  errors.push(...tls.erros);
  if (errors.length) throw new Error('Canonical database identity/TLS required');
  // URI/password stay out of argv/environment; libpq fields + temporary 0600 pgpass.
  const raw = withPsqlEnvironment(tls.connectionString, env => execFileSync(process.env.PSQL_BIN || 'psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-f', 'scripts/db-audit/runtime-config.sql'], {
    env,
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
  }));
  const evidence = evaluateRuntimeConfig(raw);
  fs.writeFileSync(destinoSaida, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); // NOSONAR(S8707): 'destinoSaida' vem de resolverCaminhoPermitido(...) acima (exit 2 fora do repo/tmp); argv[2] nao entra cru neste write
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Output path required');
    const result = runRuntimeConfigAudit(process.argv[2]);
    console.log(`Runtime configuration: ${result.status}; autovacuum=${result.coverage.autovacuum}; backups NOT verified.`);
    if (result.failures.length) process.exitCode = 1;
  } catch {
    console.error('Runtime audit failed (identity, connection or invalid evidence); sensitive diagnostics omitted.');
    process.exitCode = 1;
  }
}
