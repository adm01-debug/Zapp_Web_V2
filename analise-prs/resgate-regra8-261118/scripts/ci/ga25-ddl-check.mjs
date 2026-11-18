#!/usr/bin/env node
// GA25: detecta versions no ledger sem Deployment producao-ddl correspondente (DDL fora do fluxo).
import { spawnSync } from 'node:child_process';

const cutoff = process.env.GA25_CUTOFF || '20261016000000';
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';

// 1. Consultar ledger para versions desde o cutoff
const psqlResult = spawnSync(
  process.execPath,
  ['scripts/db-audit/psql-safe.mjs', '-X', '-v', 'ON_ERROR_STOP=1', '-t', '-A',
   '-c', `SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '${cutoff}' ORDER BY version`],
  { encoding: 'utf8' },
);
if (psqlResult.status !== 0) {
  process.stderr.write('GA25: falha ao consultar ledger:\n' + (psqlResult.stderr || '') + '\n');
  process.exit(1);
}
const ledgerVersions = new Set(psqlResult.stdout.trim().split('\n').filter(Boolean));
if (ledgerVersions.size === 0) {
  console.log(`GA25: nenhuma version no ledger desde ${cutoff}; sem DDL fora do fluxo.`);
  process.exit(0);
}
console.log(`GA25: ${ledgerVersions.size} version(s) no ledger desde ${cutoff}.`);

// 2. Listar Deployments do environment producao-ddl
const deployedVersions = new Set();
let page = 1;
while (true) {
  const url = `${apiUrl}/repos/${repo}/deployments?environment=producao-ddl&per_page=100&page=${page}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!resp.ok) {
    process.stderr.write(`GA25: erro ao consultar Deployments API (${resp.status}).\n`);
    process.exit(1);
  }
  const deployments = await resp.json();
  if (!Array.isArray(deployments) || deployments.length === 0) break;
  for (const d of deployments) {
    try {
      const raw = d.payload;
      const payload = raw && typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(payload?.versions)) {
        for (const v of payload.versions) deployedVersions.add(String(v));
      }
    } catch {}
  }
  if (deployments.length < 100) break;
  page++;
}
console.log(`GA25: ${deployedVersions.size} version(s) com Deployment producao-ddl.`);

// 3. Detectar orphans
const orphans = [...ledgerVersions].filter((v) => !deployedVersions.has(v));
if (orphans.length > 0) {
  process.stderr.write(`::error::GA25: ${orphans.length} version(s) no ledger sem Deployment producao-ddl (DDL fora do fluxo):\n`);
  for (const v of orphans) process.stderr.write(`  - ${v}\n`);
  process.stderr.write('Ver docs/MIGRATIONS.md para o procedimento de reconciliacao.\n');
  process.exit(1);
}
console.log(`GA25: todas as ${ledgerVersions.size} versions do ledger tem Deployment producao-ddl. OK.`);
