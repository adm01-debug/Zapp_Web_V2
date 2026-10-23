#!/usr/bin/env node
/**
 * GA30: resolve o ref para rollback automatico.
 *
 * Regra: escolhe o Deployment `success` mais recente do environment
 * `producao-edge-functions` cujo SHA seja DIFERENTE do publicado agora.
 * O `success` mais recente pode ser o proprio SHA atual ("No change",
 * verde, sem voltar nada) -- ele e PULADO. Se nao houver `success`
 * anterior, o script RECUSA (exit 1) em vez de republicar o SHA atual.
 *
 * Uso no workflow (step `Resolver ref para rollback automatico`):
 *   node .../scripts/edge-deploy/resolve-rollback-ref.mjs
 * com GITHUB_TOKEN no env (GITHUB_REPOSITORY/GITHUB_SHA/GITHUB_ENV ja
 * existem no runner). Emite `RESOLVED_SOURCE_REF=<sha>` no GITHUB_ENV.
 */

const ENVIRONMENT = 'producao-edge-functions';
const API = 'https://api.github.com';

/**
 * @param {{ deployments: Array<{id:number,sha:string}>, shaAtual: string,
 *           listarStatuses: (id:number) => Promise<Array<{state:string}>> }} args
 * @returns {Promise<string|null>} SHA anterior ou null (recusa).
 */
export async function escolherRefParaRollback({ deployments, shaAtual, listarStatuses }) {
  for (const dep of (deployments ?? [])) {
    if (!dep || dep.sha === shaAtual) continue; // GA30: pula o "No change" do SHA atual
    let statuses;
    try {
      statuses = await listarStatuses(dep.id);
    } catch {
      continue;
    }
    if ((statuses ?? []).some((s) => s && s.state === 'success')) return dep.sha;
  }
  return null;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const shaAtual = process.env.GITHUB_SHA;
  const envFile = process.env.GITHUB_ENV;
  if (!token || !repo || !shaAtual || !envFile) {
    process.stderr.write('resolve-rollback-ref: faltam GITHUB_TOKEN/GITHUB_REPOSITORY/GITHUB_SHA/GITHUB_ENV\n');
    process.exit(2);
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const depsRes = await fetch(
    `${API}/repos/${repo}/deployments?environment=${encodeURIComponent(ENVIRONMENT)}&per_page=20`,
    { headers },
  );
  if (!depsRes.ok) {
    process.stderr.write(`GitHub API retornou HTTP ${depsRes.status} ao listar deployments\n`);
    process.exit(1);
  }
  const deployments = await depsRes.json();
  const listarStatuses = async (id) => {
    const r = await fetch(`${API}/repos/${repo}/deployments/${id}/statuses?per_page=5`, { headers });
    if (!r.ok) return [];
    return r.json();
  };
  const escolhido = await escolherRefParaRollback({ deployments, shaAtual, listarStatuses });
  if (!escolhido) {
    process.stderr.write(
      `Nenhum Deployment success ANTERIOR ao SHA atual no environment ${ENVIRONMENT} -- rollback recusado\n`,
    );
    process.exit(1);
  }
  const { appendFileSync } = await import('node:fs');
  appendFileSync(envFile, `RESOLVED_SOURCE_REF=${escolhido}\n`);
  process.stdout.write(`Rollback para o ultimo Deployment bem-sucedido: ${escolhido}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
