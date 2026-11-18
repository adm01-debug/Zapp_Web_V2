#!/usr/bin/env node
/**
 * GA25: Verifica que toda version >= 20261016000000 no ledger possui um
 * Deployment 'producao-ddl' registrado pelo job apply de db-migrate.yml.
 *
 * Motivacao: migrations foram aplicadas por fora em 15/10 e 26/09 (casos
 * documentados). O Deployment registrado pelo job apply e a evidencia
 * rastreavel de que o DDL passou pelo fluxo correto:
 *   arquivo -> PR -> merge -> apply gateado -> Deployment registrado.
 *
 * Saida: exit 0 sem falhas, exit 1 com lista de versions sem Deployment.
 * Uso: node scripts/db-audit/check-ddl-deployments.mjs 2>&1 | tee /tmp/step-ddl-sem-deployment.log
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '../..');

const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
const REPO = process.env.GITHUB_REPOSITORY ?? 'adm01-debug/Zapp_Web_V2';
const [OWNER, REPO_NAME] = REPO.split('/');
// versions sem Deployment sao reportadas apenas para entradas apos o corte de
// 16/10/2026 — data em que GA25 foi implantado. Versoes anteriores nao passaram
// pelo script de registro e nao devem gerar falso alarme.
const CORTE = '20261016000000';

if (!GITHUB_TOKEN) {
  console.error('::error::GA25: GITHUB_TOKEN ausente — necessario para consultar Deployments API.');
  process.exit(1);
}

// 1. Ler versions >= CORTE do ledger via psql-safe.mjs
const psqlBin = path.join(ROOT, 'scripts/db-audit/psql-safe.mjs');
const psqlOut = spawnSync(
  'node',
  [
    psqlBin,
    '-X', '-t', '-A',
    '-c',
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '${CORTE}' ORDER BY version;`,
  ],
  { encoding: 'utf8', env: process.env },
);

if (psqlOut.status !== 0) {
  const detalhe = (psqlOut.stderr || psqlOut.stdout || '').slice(0, 400);
  console.error(`::error::GA25: erro ao ler ledger: ${detalhe}`);
  process.exit(1);
}

const versions = psqlOut.stdout.trim().split('\n').filter(Boolean);
console.log(`GA25: versions no ledger desde ${CORTE}: ${versions.length}`);

if (versions.length === 0) {
  console.log(`OK: nenhuma version >= ${CORTE} no ledger.`);
  process.exit(0);
}

// 2. Buscar Deployments registrados em producao-ddl via GitHub Deployments API
async function listarDeployments() {
  const deps = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO_NAME}/deployments?environment=producao-ddl&per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'check-ddl-deployments/1.0',
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub Deployments API → ${res.status}: ${text.slice(0, 300)}`);
    }
    const pagina = await res.json();
    if (!Array.isArray(pagina) || pagina.length === 0) break;
    deps.push(...pagina);
    if (pagina.length < 100) break;
    page++;
  }
  return deps;
}

let deps;
try {
  deps = await listarDeployments();
} catch (e) {
  console.error(`::error::GA25: erro ao consultar Deployments API: ${e.message}`);
  process.exit(1);
}

console.log(`GA25: Deployments em producao-ddl encontrados: ${deps.length}`);

// Extrair migration_version do payload de cada Deployment
const deployed = new Set(
  deps.flatMap((d) => {
    try {
      const payload = typeof d.payload === 'string' ? JSON.parse(d.payload) : (d.payload ?? {});
      return payload && payload.migration_version ? [String(payload.migration_version)] : [];
    } catch {
      return [];
    }
  }),
);

const semDep = versions.filter((v) => !deployed.has(v));

if (semDep.length > 0) {
  console.error(`::error::GA25: ${semDep.length} version(s) sem Deployment producao-ddl registrado:`);
  for (const v of semDep) {
    console.error(`  - ${v}`);
  }
  process.exit(1);
}

console.log('OK: todas as versions possuem Deployment producao-ddl registrado.');
process.exit(0);
