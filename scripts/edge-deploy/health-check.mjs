#!/usr/bin/env node
// W65: pós-deploy health check — 5 min após deploy, consulta logs de erro pela
// Management API e falha com ::error:: se a taxa de 5xx superar o limiar.
// Degradação controlada: falha de transporte ou API indisponível → ::warning::,
// nunca ::error:: — o check não pode derrubar deploys por indisponibilidade de
// observabilidade.
import { readFile } from 'node:fs/promises';

const CANONICAL_PROJECT = 'tnnnlkbymytvtqngbbqh';
const MGMT_BASE = 'https://api.supabase.com';
const DEFAULT_THRESHOLD = 0.10; // 10% de 5xx = falha
const DEFAULT_WAIT_MS = 5 * 60 * 1000; // 5 min
const WINDOW_MINUTES = 5;

function parseArgs(argv) {
  const args = {
    threshold: DEFAULT_THRESHOLD,
    waitMs: DEFAULT_WAIT_MS,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--project-ref') args.projectRef = argv[++i];
    else if (argv[i] === '--scope') args.scope = argv[++i];
    else if (argv[i] === '--threshold') args.threshold = parseFloat(argv[++i]);
    else if (argv[i] === '--wait-ms') args.waitMs = parseInt(argv[++i], 10);
    else if (argv[i] === '--no-wait') args.waitMs = 0;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--manifest') args.manifestPath = argv[++i];
    else throw new Error(`Argumento desconhecido: ${argv[i]}`);
  }
  if (!args.projectRef) throw new Error('--project-ref obrigatorio');
  if (args.projectRef !== CANONICAL_PROJECT) throw new Error('Apenas o projeto canonico e aceito');
  return args;
}

// Retorna lista de slugs a verificar: escopo "all" → todas as funções do manifesto;
// caso contrário, só a função nomeada.
async function resolveScope(scope, manifestPath) {
  if (scope && scope !== 'all') return [scope];
  if (manifestPath) {
    const raw = JSON.parse(await readFile(manifestPath, 'utf8'));
    return (raw.functions ?? []).map((fn) => fn.name).filter(Boolean);
  }
  return [];
}

// Monta a SQL de análise de logs de edge para a janela configurada.
// Endpoint documentado: POST https://api.supabase.com/v1/projects/{ref}/analytics/endpoints/logs.all
// com body { sql } e Authorization: Bearer <SUPABASE_ACCESS_TOKEN> (personal access token).
// A tabela BigQuery é `edge_logs`; o campo de status HTTP é metadata[].response.status_code
// (snake_case, REPEATED — UNNEST necessário).
function buildLogsSql(slugs, windowMinutes) {
  const slugFilter = slugs.length > 0
    ? `AND m.function_id IN (${slugs.map((s) => `'${s}'`).join(', ')})`
    : '';
  return (
    `SELECT ` +
    `  COUNT(1) AS total, ` +
    `  COUNTIF(CAST(m.response.status_code AS INT64) >= 500) AS errors ` +
    `FROM edge_logs ` +
    `  CROSS JOIN UNNEST(metadata) AS m ` +
    `WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${windowMinutes} MINUTE) ` +
    slugFilter
  ).trim();
}

// Erro com código HTTP para distinguir 4xx (config) de 5xx (transiente).
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Chama a Management API de analytics do Supabase.
// Lança HttpError se o HTTP não for 2xx; devolve null se a resposta não tiver linhas.
// GA29: 4xx = erro de configuração (::error::); 5xx/timeout = transiente (::warning::).
async function queryAnalytics({ projectRef, token, sql, fetchImpl = fetch }) {
  const url = `${MGMT_BASE}/v1/projects/${projectRef}/analytics/endpoints/logs.all`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    // Não logar o corpo da resposta: pode conter detalhes de autenticação.
    throw new HttpError(res.status, `Management API retornou HTTP ${res.status} na consulta de analytics`);
  }
  const json = await res.json();
  // A API retorna { result: [{ total: N, errors: N }] } quando bem-sucedida.
  if (!Array.isArray(json.result) || json.result.length === 0) return null;
  return json.result[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token?.trim()) {
    console.error('::warning::SUPABASE_ACCESS_TOKEN ausente — health check ignorado');
    return;
  }

  const slugs = await resolveScope(args.scope, args.manifestPath);
  const nomeScope = args.scope || 'all';

  if (args.dryRun) {
    console.log(`[health-check] Ensaio — escopo: ${nomeScope}; funções: ${slugs.length || '(todas)'}`);
    console.log('[health-check] Dry run: sem espera e sem chamada à API.');
    return;
  }

  if (args.waitMs > 0) {
    const minutos = Math.round(args.waitMs / 60_000);
    console.log(`[health-check] Aguardando ${minutos} min para os logs de pós-deploy estabilizarem…`);
    await new Promise((resolve) => setTimeout(resolve, args.waitMs));
  }

  const sql = buildLogsSql(slugs, WINDOW_MINUTES);
  let row;
  try {
    row = await queryAnalytics({
      projectRef: args.projectRef,
      token,
      sql,
    });
  } catch (err) {
    if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
      // GA29: 4xx = erro de configuração (endpoint errado, auth falhou) — falha dura.
      console.error(`::error::Health check falhou com HTTP ${err.status}: ${err.message}. Verifique o endpoint e o SUPABASE_ACCESS_TOKEN.`);
      process.exitCode = 1;
    } else {
      // 5xx ou falha de transporte/timeout → aviso, não bloqueia o deploy.
      console.error(`::warning::Health check falhou ao consultar a Management API: ${err.message}. Prosseguindo.`);
    }
    return;
  }

  if (row === null) {
    console.log('[health-check] Nenhum log na janela de observação — sem invocações recentes ou logs ainda não propagados.');
    return;
  }

  const total = Number(row.total ?? 0);
  const errors = Number(row.errors ?? 0);

  if (total === 0) {
    console.log('[health-check] Zero invocações na janela — sem tráfego suficiente para medir taxa de erro.');
    return;
  }

  const errorRate = errors / total;
  const pct = (errorRate * 100).toFixed(1);
  console.log(`[health-check] Escopo: ${nomeScope} | invocações: ${total} | erros 5xx: ${errors} | taxa: ${pct}%`);

  if (errorRate > args.threshold) {
    const limiar = (args.threshold * 100).toFixed(0);
    console.error(
      `::error::Health check FALHOU — taxa de 5xx (${pct}%) supera o limiar de ${limiar}% ` +
        `nas últimas ${WINDOW_MINUTES} min. Verifique os logs da função e considere o rollback ` +
        `(dispatch com rollback_to_last_success=true).`
    );
    process.exitCode = 1;
  } else {
    console.log(`[health-check] OK — taxa de 5xx (${pct}%) dentro do limiar.`);
  }
}

main().catch((err) => {
  if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
    console.error(`::error::health-check.mjs falhou com HTTP ${err.status}: ${err.message}`);
    process.exitCode = 1;
  } else {
    console.error(`::warning::health-check.mjs falhou inesperadamente: ${err.message}. Prosseguindo.`);
  }
});
