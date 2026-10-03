#!/usr/bin/env node
// E60: registra o Deployment de rastreabilidade do deploy de edge.
//
// Best-effort por decisao: falha ao registrar AVISA e nao derruba o deploy (o
// codigo ja esta no ar quando este passo roda -- falhar aqui nao despublica nada
// e so' esconde o resultado do operador).
import { appendFileSync } from 'node:fs';
import { construirDeployment, construirStatus, resumirDeployment } from './deployment-record.mjs';

const {
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
  GITHUB_RUN_ID,
  GITHUB_SERVER_URL = 'https://github.com',
  GITHUB_OUTPUT,
  DEPLOYED_GIT_SHA,
  ESCOPO,
} = process.env;

const api = process.env.GITHUB_API_URL || 'https://api.github.com';
const runUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;

/**
 * S7044: monta o destino da requisicao com allowlist de host.
 *
 * O `fetch` abaixo carrega `Authorization: Bearer ${GITHUB_TOKEN}`. Aceitar o destino
 * cru de `GITHUB_API_URL` significa entregar o token para quem controlar essa variavel
 * de ambiente no runner. O caminho do Sonar fala em "API traversal", mas o risco real e'
 * exfiltracao de credencial por redirecionamento de destino.
 *
 * Regras: https obrigatorio (http entregaria o token em claro), host na allowlist
 * (api.github.com, ou o host do GitHub Enterprise vindo de GITHUB_SERVER_URL) e caminho
 * comecando com '/' e sem travessia.
 */
export function resolverDestino(apiUrl, caminho, serverUrl = process.env.GITHUB_SERVER_URL) {
  const base = String(apiUrl ?? '').trim().replace(/\/+$/, '');
  let destino;
  try {
    destino = new URL(base);
  } catch {
    throw new Error(`destino recusado (URL invalida): ${base}`);
  }
  if (destino.protocol !== 'https:') {
    throw new Error(`destino nao permitido (exige https, recebido ${destino.protocol}, host ${destino.host}): ${base}`);
  }
  let hostEnterprise = null;
  if (serverUrl) {
    try {
      hostEnterprise = new URL(String(serverUrl)).host;
    } catch {
      hostEnterprise = null;
    }
  }
  const eApiPublica = destino.host === 'api.github.com' && (destino.pathname === '/' || destino.pathname === '');
  const eEnterprise = hostEnterprise !== null && destino.host === hostEnterprise;
  if (!eApiPublica && !eEnterprise) {
    throw new Error(`destino nao permitido (allowlist): host ${destino.host}`);
  }
  const c = String(caminho ?? '');
  if (!c.startsWith('/') || c.includes('..')) {
    throw new Error(`caminho recusado (precisa comecar com / e nao conter ..): ${c}`);
  }
  return `${base}${c}`;
}

async function post(caminho, corpo) {
  const r = await fetch(resolverDestino(api, caminho, GITHUB_SERVER_URL), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${caminho} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

try {
  const dep = await post(
    `/repos/${GITHUB_REPOSITORY}/deployments`,
    construirDeployment({ shaDeployado: DEPLOYED_GIT_SHA, runId: GITHUB_RUN_ID, runUrl, escopo: ESCOPO }),
  );
  const st = await post(
    `/repos/${GITHUB_REPOSITORY}/deployments/${dep.id}/statuses`,
    construirStatus({ id: dep.id, runUrl }),
  );
  console.log(`::notice::Deployment registrado: ${resumirDeployment(dep)} (id=${dep.id}, status=${st.state})`);
  console.log(`deployment_id=${dep.id}`);
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `deployment_id=${dep.id}\n`);
} catch (e) {
  // Nunca derruba o deploy: o job elevou o passo a best-effort desde a tag.
  console.log(`::warning::Falha ao registrar o Deployment (deploy nao afetado): ${e.message}`);
}
