#!/usr/bin/env node
// W65: pós-deploy health check — consulta a API atual de logs do Supabase e
// bloqueia regressões 5xx. Somente indisponibilidade transitória de
// observabilidade (transporte, timeout ou HTTP 5xx) degrada para warning.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CANONICAL_PROJECT = 'tnnnlkbymytvtqngbbqh';
export const MGMT_BASE = 'https://api.supabase.com';
export const DEFAULT_THRESHOLD = 0.10;
export const DEFAULT_WAIT_MS = 5 * 60 * 1000;
export const MAX_WAIT_MS = 15 * 60 * 1000;
export const WINDOW_MS = 5 * 60 * 1000;
export const MAX_LOG_WINDOW_MS = 24 * 60 * 60 * 1000;

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export class TransientAnalyticsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransientAnalyticsError';
  }
}

function optionValue(argv, index, name) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} exige um valor`);
  return value;
}

export function validateSlug(value) {
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    throw new Error(`slug de função inválido: ${String(value)}`);
  }
  return value;
}

export function parseArgs(argv) {
  const args = {
    threshold: DEFAULT_THRESHOLD,
    waitMs: DEFAULT_WAIT_MS,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--project-ref') args.projectRef = optionValue(argv, i++, key);
    else if (key === '--scope') args.scope = optionValue(argv, i++, key);
    else if (key === '--threshold') args.threshold = Number(optionValue(argv, i++, key));
    else if (key === '--wait-ms') {
      const raw = optionValue(argv, i++, key);
      if (!/^(?:0|[1-9]\d*)$/.test(raw)) throw new Error('--wait-ms deve ser um inteiro não negativo');
      args.waitMs = Number(raw);
    } else if (key === '--no-wait') args.waitMs = 0;
    else if (key === '--dry-run') args.dryRun = true;
    else if (key === '--manifest') args.manifestPath = optionValue(argv, i++, key);
    else throw new Error(`Argumento desconhecido: ${key}`);
  }

  if (!args.projectRef) throw new Error('--project-ref obrigatório');
  if (args.projectRef !== CANONICAL_PROJECT) throw new Error('Apenas o projeto canônico é aceito');
  if (!args.manifestPath) throw new Error('--manifest obrigatório');
  if (!Number.isFinite(args.threshold) || args.threshold < 0 || args.threshold > 1) {
    throw new Error('--threshold deve estar entre 0 e 1');
  }
  if (!Number.isSafeInteger(args.waitMs) || args.waitMs < 0 || args.waitMs > MAX_WAIT_MS) {
    throw new Error(`--wait-ms deve estar entre 0 e ${MAX_WAIT_MS}`);
  }
  if (args.scope && args.scope !== 'all') validateSlug(args.scope);
  return args;
}

function parseManifest(raw) {
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error('Manifesto Edge não contém JSON válido');
  }
  if (!manifest || !Array.isArray(manifest.functions) || manifest.functions.length === 0) {
    throw new Error('Manifesto Edge sem lista de funções');
  }
  const slugs = manifest.functions.map((fn) => validateSlug(fn?.name));
  if (new Set(slugs).size !== slugs.length) throw new Error('Manifesto Edge contém funções duplicadas');
  return slugs;
}

export async function resolveScope(scope, manifestPath, readFileImpl = readFile) {
  const slugs = parseManifest(await readFileImpl(manifestPath, 'utf8'));
  if (!scope || scope === 'all') return slugs;
  validateSlug(scope);
  if (!slugs.includes(scope)) throw new Error(`Função fora do manifesto: ${scope}`);
  return [scope];
}

function pathnamePredicate(slug) {
  const pathname = `/functions/v1/${validateSlug(slug)}`;
  return `(log_attributes['request.pathname'] = '${pathname}' OR ` +
    `startsWith(log_attributes['request.pathname'], '${pathname}/'))`;
}

export function buildLogsSql(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) throw new Error('Escopo de logs vazio');
  const unique = [...new Set(slugs.map(validateSlug))];
  const scopeFilter = unique.map(pathnamePredicate).join(' OR ');
  return (
    `SELECT ` +
    `count() AS total, ` +
    `countIf(toInt32OrZero(log_attributes['response.status_code']) BETWEEN 500 AND 599) AS errors ` +
    `FROM logs ` +
    `WHERE source = 'function_edge_logs' ` +
    `AND (${scopeFilter})`
  );
}

function isoTimestamp(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} inválido`);
  return date.toISOString();
}

function parseCount(value, label) {
  if (typeof value === 'string' && !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new Error(`Resposta de logs contém ${label} inválido`);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Resposta de logs contém ${label} inválido`);
  }
  return parsed;
}

export async function queryAnalytics({
  projectRef,
  token,
  sql,
  start,
  end,
  fetchImpl = fetch,
  timeoutSignal = () => AbortSignal.timeout(30_000),
}) {
  if (projectRef !== CANONICAL_PROJECT) throw new Error('Projeto de logs inválido');
  if (typeof token !== 'string' || !token.trim()) throw new Error('SUPABASE_ACCESS_TOKEN ausente');
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('SQL de logs ausente');

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('Janela de logs inválida');
  }
  if (endMs - startMs > MAX_LOG_WINDOW_MS) throw new Error('Janela de logs excede 24 horas');

  const url = new URL(`${MGMT_BASE}/v1/projects/${projectRef}/analytics/endpoints/logs`);
  url.searchParams.set('sql', sql);
  url.searchParams.set('iso_timestamp_start', isoTimestamp(start, 'Início da janela'));
  url.searchParams.set('iso_timestamp_end', isoTimestamp(end, 'Fim da janela'));

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: timeoutSignal(),
    });
  } catch {
    throw new TransientAnalyticsError('transporte ou timeout ao consultar logs');
  }

  if (response.status >= 500) {
    throw new TransientAnalyticsError(`Management API indisponível (HTTP ${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`Management API recusou a consulta de logs (HTTP ${response.status})`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Management API retornou JSON inválido');
  }
  if (!payload || !Array.isArray(payload.result)) {
    throw new Error('Contrato inválido na resposta da Management API');
  }
  if (payload.result.length === 0) return null;
  if (payload.result.length !== 1 || !payload.result[0] || typeof payload.result[0] !== 'object') {
    throw new Error('Contrato inválido na agregação de logs');
  }
  const total = parseCount(payload.result[0].total, 'total');
  const errors = parseCount(payload.result[0].errors, 'errors');
  if (errors > total) throw new Error('Resposta de logs contém mais erros que invocações');
  return { total, errors };
}

export async function runHealthCheck(args, {
  env = process.env,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console,
  readFileImpl = readFile,
} = {}) {
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (typeof token !== 'string' || !token.trim()) throw new Error('SUPABASE_ACCESS_TOKEN ausente');

  const slugs = await resolveScope(args.scope, args.manifestPath, readFileImpl);
  const scopeName = args.scope || 'all';

  if (args.dryRun) {
    logger.log(`[health-check] Ensaio — escopo: ${scopeName}; funções: ${slugs.length}`);
    logger.log('[health-check] Dry run: sem espera e sem chamada à API.');
    return { status: 'dry-run' };
  }

  if (args.waitMs > 0) {
    logger.log(`[health-check] Aguardando ${Math.round(args.waitMs / 60_000)} min para os logs estabilizarem…`);
    await sleep(args.waitMs);
  }

  const end = new Date(now());
  const start = new Date(end.getTime() - WINDOW_MS);
  let row;
  try {
    row = await queryAnalytics({
      projectRef: args.projectRef,
      token,
      sql: buildLogsSql(slugs),
      start,
      end,
      fetchImpl,
    });
  } catch (error) {
    if (!(error instanceof TransientAnalyticsError)) throw error;
    logger.error(`::warning::Health check sem observabilidade transitória: ${error.message}. Prosseguindo.`);
    return { status: 'warning', reason: error.message };
  }

  if (row === null || row.total === 0) {
    logger.log('[health-check] Zero invocações na janela — sem tráfego suficiente para medir taxa de erro.');
    return { status: 'no-traffic', total: 0, errors: 0 };
  }

  const errorRate = row.errors / row.total;
  const pct = (errorRate * 100).toFixed(1);
  logger.log(`[health-check] Escopo: ${scopeName} | invocações: ${row.total} | erros 5xx: ${row.errors} | taxa: ${pct}%`);
  if (errorRate > args.threshold) {
    const thresholdPct = (args.threshold * 100).toFixed(0);
    logger.error(
      `::error::Health check FALHOU — taxa de 5xx (${pct}%) supera o limiar de ${thresholdPct}% ` +
      `nas últimas ${WINDOW_MS / 60_000} min.`,
    );
    return { status: 'failed', total: row.total, errors: row.errors, errorRate };
  }
  logger.log(`[health-check] OK — taxa de 5xx (${pct}%) dentro do limiar.`);
  return { status: 'passed', total: row.total, errors: row.errors, errorRate };
}

export async function main(argv = process.argv.slice(2), dependencies) {
  const outcome = await runHealthCheck(parseArgs(argv), dependencies);
  if (outcome.status === 'failed') process.exitCode = 1;
  return outcome;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`::error::health-check.mjs falhou: ${error.message}`);
    process.exitCode = 1;
  });
}
