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
// A API de analytics do Supabase usa BigQuery-flavored SQL contra a tabela
// `edge_logs`. O campo de status HTTP fica em metadata[offset(0)].response.statusCode
// (array UNNEST necessário porque metadata é REPEATED).
function buildLogsSql(slugs, windowMinutes) {
  const slugFilter = slugs.length > 0
    ? `AND m.function IN (${slugs.map((s) => `'${s}'`).join(', ')})`
    : '';
  return (
    `SELECT ` +
    `  COUNT(1) AS total, ` +
    `  COUNTIF(CAST(m.response.statusCode AS INT64) >= 500) AS errors ` +
    `FROM edge_logs ` +
    `  CROSS JOIN UNNEST(metadata) AS m ` +
    `WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${windowMinutes} MINUTE) ` +
    slugFilter
  ).trim();
}

// GA29: verifica se as funcoes estao listadas na Management API antes do warmup.
// Lanca se o HTTP nao for 2xx ou se algum slug estiver ausente.
async function checkFunctionsDeployed({ projectRef, token, slugs, fetchImpl = fetch }) {
  const url = `${MGMT_BASE}/v1/projects/${projectRef}/functions`;
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Management API retornou HTTP ${res.status} ao listar functions`);
  }
  const fns = await res.json();
  if (!Array.isArray(fns)) {
    throw new Error('Resposta inesperada da Management API (esperado array de functions)');
  }
  if (slugs.length === 0) return;
  const deployedSlugs = new Set(fns.map((fn) => fn.slug ?? fn.name).filter(Boolean));
  const missing = slugs.filter((s) => !deployedSlugs.has(s));
  if (missing.length > 0) {
    throw new Error(`Functions nao encontradas na Management API apos o deploy: ${missing.join(', ')}`);
  }
}

// Chama a Management API de analytics do Supabase.
// Lança se o HTTP não for 2xx; devolve null se a resposta não tiver linhas.
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
    // GA29: propaga o status HTTP para distinguir 4xx (endpoint errado) de 5xx (serviço fora).
    const err = new Error(`Management API retornou HTTP ${res.status} na consulta de analytics`);
    err.httpStatus = res.status;
    throw err;
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

  // GA29: confirmar que as funcoes estao listadas na Management API antes de aguardar warmup.
  try {
    await checkFunctionsDeployed({ projectRef: args.projectRef, token, slugs });
    console.log(`[health-check] Functions verificadas na Management API (${slugs.length || 'todas'}).`);
  } catch (err) {
    console.error(`::warning::Health check nao conseguiu verificar functions: ${err.message}. Prosseguindo.`);
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
    if (err.httpStatus >= 400 && err.httpStatus < 500) {
      // GA29: 4xx = endpoint incorreto ou credencial recusada → falha explícita.
      console.error(`::error::Health check: analytics retornou HTTP ${err.httpStatus} — verifique o endpoint e a credencial. ${err.message}`);
      process.exitCode = 1;
    } else {
      // 5xx ou falha de transporte: serviço temporariamente indisponível → aviso, não bloqueia.
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
  console.error(`::warning::health-check.mjs falhou inesperadamente: ${err.message}. Prosseguindo.`);
});
