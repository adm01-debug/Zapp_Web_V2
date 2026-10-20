#!/usr/bin/env node
// Serializa o deploy de TODAS as funcoes contra deploys por funcao.
//
// A concurrency do workflow e por funcao (`deploy-edge-functions-<fn|all>`), para
// que dispatches de funcoes diferentes nao se cancelem. Mas o escopo `all` tambem
// publica cada funcao: rodando junto de um deploy dirigido (rollback por
// `source_ref`, ou dispatches de SHAs diferentes da main), os dois publicam
// bundles distintos, vence a ultima escrita e a atestacao metadata-only pode
// atribuir o bump de versao ao SHA errado. A concurrency do GitHub nao exprime
// "um grupo exclui todos os outros"; este passo faz isso dentro do job.
//
// Regra: dois runs conflitam quando um deles e `all`. Um run espera enquanto
// houver run conflitante em execucao que (a) ja passou deste passo, ou (b) ainda
// esta nele mas e mais antigo (id menor) — o mais antigo vence o empate, entao
// nunca ha espera mutua.
import { pathToFileURL } from 'node:url';

export const GATE_STEP_NAME = 'Serializar escopo TODAS contra deploys por funcao';
/** Teto da espera. O `timeout-minutes` do job precisa cobrir isto + um deploy completo (meta-teste pina). */
export const MAX_WAIT_MINUTES = 40;

/** Titulo do run: "Deploy Edge Functions (<escopo>)". Sem escopo (run antigo) = `all`, por cautela. */
export function parseScopeFromTitle(title) {
  const match = /\(([^()]+)\)\s*$/.exec(title ?? '');
  return match ? match[1].trim() : 'all';
}

/**
 * @param {{ id: number, scope: string }} me
 * @param {{ id: number, scope: string, gatePassed: boolean }[]} others runs em execucao
 * @returns {{ id: number, scope: string }[]} runs pelos quais `me` precisa esperar
 */
export function blockingRuns(me, others) {
  return others.filter((other) => other.id !== me.id
    && (me.scope === 'all' || other.scope === 'all')
    && (other.gatePassed || other.id < me.id));
}

async function githubGet(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} em ${path.split('?')[0]}`);
  return response.json();
}

/**
 * Runs deste workflow em execucao, com o escopo e se ja passaram do gate. Busca jobs so dos
 * conflitantes que ainda nao foram vistos passando: passar do gate e irreversivel, entao
 * `passedGates` (mutado aqui) evita reconsultar — senao, esperando atras de varios runs longos,
 * o laco estoura a cota de 1000 req/h do GITHUB_TOKEN (review do #1315).
 */
export async function listInProgress({ repo, workflowFile, token, me, get = githubGet, passedGates = new Set() }) {
  const data = await get(`/repos/${repo}/actions/workflows/${workflowFile}/runs?status=in_progress&per_page=100`, token);
  const runs = (data.workflow_runs ?? []).map((run) => ({ id: Number(run.id), scope: parseScopeFromTitle(run.display_title) }))
    .filter((run) => run.id !== me.id && (me.scope === 'all' || run.scope === 'all'));
  for (const run of runs) {
    if (passedGates.has(run.id)) { run.gatePassed = true; continue; }
    const jobs = await get(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`, token);
    run.gatePassed = (jobs.jobs ?? []).some((job) => (job.steps ?? [])
      .some((step) => step.name === GATE_STEP_NAME && step.status === 'completed'));
    if (run.gatePassed) passedGates.add(run.id);
  }
  return runs;
}

export async function waitForTurn({
  me, repo, workflowFile, token, get = githubGet,
  intervalMs = 30_000, maxWaitMs = MAX_WAIT_MINUTES * 60_000, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log,
}) {
  const started = now();
  const passedGates = new Set();
  for (;;) {
    const blocking = blockingRuns(me, await listInProgress({ repo, workflowFile, token, me, get, passedGates }));
    if (blocking.length === 0) return;
    if (now() - started >= maxWaitMs) {
      throw new Error(`Deploy ${me.scope} ainda conflita com run(s) ${blocking.map((r) => `${r.id}(${r.scope})`).join(', ')} apos ${maxWaitMs / 60_000} min`);
    }
    log(`Aguardando run(s) conflitante(s): ${blocking.map((r) => `${r.id}(${r.scope})`).join(', ')}`);
    await sleep(intervalMs);
  }
}

async function main() {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, SCOPE } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !/^\d+$/.test(GITHUB_RUN_ID ?? '')) throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY e GITHUB_RUN_ID obrigatorios');
  const me = { id: Number(GITHUB_RUN_ID), scope: SCOPE || 'all' };
  await waitForTurn({ me, repo: GITHUB_REPOSITORY, workflowFile: 'deploy-functions.yml', token: GITHUB_TOKEN });
  console.log(`Sem deploy conflitante em execucao; seguindo com escopo ${me.scope}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => { console.error(`::error::${error.message}`); process.exit(1); });
}
