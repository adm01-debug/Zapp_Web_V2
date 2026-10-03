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

async function post(caminho, corpo) {
  const r = await fetch(`${api}${caminho}`, {
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
