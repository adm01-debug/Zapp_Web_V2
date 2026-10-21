#!/usr/bin/env node
// GA25: registra um Deployment 'producao-ddl' por version aplicada.
// O guarda vivo (db-live-guard.yml step ddl-sem-deployment) cruza o ledger
// com esses Deployments para detectar DDL aplicado fora do fluxo.

const {
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
  GITHUB_SHA,
  TARGET_VERSION,
  APPLY_ALL_MISSING,
  MISSING_VERSIONS,
} = process.env;

const versions =
  APPLY_ALL_MISSING === 'true'
    ? (MISSING_VERSIONS || '').split(/\s+/).filter(Boolean)
    : TARGET_VERSION
      ? [TARGET_VERSION]
      : [];

if (versions.length === 0) {
  process.stderr.write('GA25: nenhuma version para registrar Deployment.\n');
  process.exit(0);
}

const [owner, repo] = GITHUB_REPOSITORY.split('/');
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
const headers = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

for (const version of versions) {
  let depId;
  try {
    const res = await fetch(`${apiBase}/deployments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: GITHUB_SHA,
        environment: 'producao-ddl',
        description: `GA25: apply migration ${version}`,
        auto_merge: false,
        required_contexts: [],
        payload: { migration_version: version, applied_at: new Date().toISOString() },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      process.stderr.write(`GA25: falha ao criar Deployment para ${version}: ${res.status} ${text}\n`);
      continue;
    }
    const dep = await res.json();
    depId = dep.id;
  } catch (e) {
    process.stderr.write(`GA25: falha ao criar Deployment para ${version}: ${e.message}\n`);
    continue;
  }

  try {
    const res = await fetch(`${apiBase}/deployments/${depId}/statuses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        state: 'success',
        description: `migration ${version} aplicada via db-migrate.yml`,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      process.stderr.write(`GA25: Deployment criado (id=${depId}) mas status falhou: ${res.status} ${text}\n`);
    } else {
      process.stdout.write(`GA25: Deployment registrado para ${version} (id=${depId}).\n`);
    }
  } catch (e) {
    process.stderr.write(`GA25: Deployment criado (id=${depId}) mas status falhou: ${e.message}\n`);
  }
}
