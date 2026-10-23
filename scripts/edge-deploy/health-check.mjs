#!/usr/bin/env node
// W65: pós-deploy health check — 5 min após deploy, consulta logs de erro pela
// Management API e falha com ::error:: se a taxa de 5xx superar o limiar.
// GA29: o endpoint e o método seguem a Management API Reference ("Get project
// logs"): GET /v1/projects/{ref}/analytics/endpoints/logs com `sql` +
// `iso_timestamp_start/end`, SQL em dialeto ClickHouse sobre a tabela unificada
// `logs` (`source = 'edge_logs'`, status em
// `log_attributes['response.status_code']`). O POST em `logs.all` (BigQuery)
// devolvia 404 em todo deploy — e como todo erro virava warning, a saúde nunca
// falhava. Agora 4xx = ::error:: (configuração/permissão errada é defeito real);
// só 5xx/transporte/timeout continuam ::warning:: (observabilidade indisponível
// não derruba um deploy bem-sucedido).
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

// Slugs entram na SQL por interpolacao: a forma e travada aqui para a consulta
// nunca carregar dado arbitrario.
export function slugValido(slug) {
  return typeof slug === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug);
}

// Monta a SQL de análise de logs de edge (dialeto ClickHouse, tabela unificada
// `logs`). A janela de tempo vai nos parametros `iso_timestamp_*` da API, nao na
// SQL. O filtro por funcao usa a URL da invocacao
// (`https://<ref>.supabase.co/functions/v1/<slug>...`), presente nos eventos de
// requisicao do gateway.
export function buildLogsSql(slugs) {
  const validos = (slugs ?? []).filter(slugValido);
  const escopo = validos.length > 0
    ? ` AND (${validos.map((s) => `position(log_attributes['request.url'], '/functions/v1/${s}') > 0`).join(' OR ')})`
    : '';
  return (
    `SELECT count() AS total, ` +
    `countIf(toInt32OrZero(log_attributes['response.status_code']) >= 500) AS errors ` +
    `FROM logs WHERE source = 'edge_logs'` +
    escopo
  );
}

// Chama a Management API de analytics do Supabase (GET .../endpoints/logs).
// 2xx com linhas: devolve a primeira ({ total, errors }); 2xx sem linhas: null.
// 4xx: configuração/permissão/escopo errado — `severidade: 'erro'` (GA29).
// 5xx/transporte/timeout: `severidade: 'aviso' (observabilidade indisponível).
// Não logar corpo de resposta: pode conter detalhes de autenticação.
export async function queryAnalytics({ projectRef, token, sql, inicio, fim, fetchImpl = fetch }) {
  const params = new URLSearchParams({ sql, iso_timestamp_start: inicio, iso_timestamp_end: fim });
  const url = `${MGMT_BASE}/v1/projects/${projectRef}/analytics/endpoints/logs?${params}`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const aviso = new Error(`Management API inacessivel: ${err.message}`);
    aviso.severidade = 'aviso';
    throw aviso;
  }
  if (!res.ok) {
    const erro = new Error(`Management API retornou HTTP ${res.status} na consulta de analytics`);
    erro.status = res.status;
    erro.severidade = res.status >= 500 ? 'aviso' : 'erro';
    throw erro;
  }
  const json = await res.json();
  // A API retorna { result: [{ total, errors }], error } quando bem-sucedida.
  if (typeof json.error === 'string' && json.error) {
    const erro = new Error(`Management API devolveu erro: ${json.error}`);
    erro.severidade = 'erro';
    throw erro;
  }
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

  const fim = new Date();
  const inicio = new Date(fim.getTime() - WINDOW_MINUTES * 60_000);
  const sql = buildLogsSql(slugs);
  let row;
  try {
    row = await queryAnalytics({
      projectRef: args.projectRef,
      token,
      sql,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
    });
  } catch (err) {
    // GA29: 4xx (endpoint/permissao/escopo) = defeito real, ::error:: com exit 1.
    // Só 5xx/transporte/timeout continuam aviso: observabilidade indisponível
    // não derruba um deploy bem-sucedido.
    if (err && err.severidade === 'erro') {
      console.error(`::error::Health check FALHOU na Management API: ${err.message}.`);
      process.exitCode = 1;
      return;
    }
    console.error(`::warning::Health check falhou ao consultar a Management API: ${err.message}. Prosseguindo.`);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`::warning::health-check.mjs falhou inesperadamente: ${err.message}. Prosseguindo.`);
  });
}
