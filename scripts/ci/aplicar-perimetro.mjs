#!/usr/bin/env node
/**
 * GA80 — Perímetro só por script versionado.
 *
 * Aplica `scripts/ci/github-settings-baseline.json` no repositório vivo.
 * DRY-RUN POR PADRÃO: só lista os PATCHes que faria. Aplicar exige
 * `--apply --confirm=APLICAR-PERIMETRO` e token com `administration:write`
 * (nunca o GITHUB_TOKEN de workflow). PATCH manual (curl, MCP, console do
 * GitHub) é proibido pelo CLAUDE.md, seção 0 — foi assim que o `strict`
 * regrediu 4 vezes e o `CodeQL` entrou por API sem baseline.
 *
 * Uso:
 *   node scripts/ci/aplicar-perimetro.mjs                       # dry-run
 *   node scripts/ci/aplicar-perimetro.mjs --apply --confirm=APLICAR-PERIMETRO
 *
 * Verificação da GA80: dry-run sem diferença contra o vivo.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPO = process.env.GITHUB_REPOSITORY ?? 'adm01-debug/Zapp_Web_V2';
const TOKEN = process.env.PERIMETER_APPLY_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const [OWNER, REPO_NAME] = REPO.split('/');
const BRANCH = 'main';

const baseline = JSON.parse(
  readFileSync(new URL('./github-settings-baseline.json', import.meta.url), 'utf8'),
);

const args = new Set(process.argv.slice(2));
const QUER_APLICAR = args.has('--apply');
const CONFIRM = (process.argv.find((a) => a.startsWith('--confirm=')) ?? '=').slice('--confirm='.length);

function api(path, metodo = 'GET', corpo) {
  return fetch(`https://api.github.com${path}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'aplicar-perimetro/1.0',
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }).then(async (res) => {
    if (!res.ok) throw new Error(`GitHub API ${metodo} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  });
}

/** Monta a lista de PATCHes (cada um: {descricao, metodo, path, corpo}). */
export async function planejar(ler = api) {
  const planos = [];
  const bp = baseline.branch_protection_main;

  const protection = await ler(`/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection`);
  const checks = protection?.required_status_checks ?? {};
  // GA80: checks com app_id quando o baseline trouxer (GA03); senao, contexts.
  const detalhados = bp.required_checks_com_app_id ?? null;
  const corpoChecks = detalhados
    ? { strict: bp.strict, checks: detalhados }
    : { strict: bp.strict, contexts: [...bp.required_status_checks].sort() };
  const checksVivos = detalhados
    ? (checks.checks ?? null)
    : (checks.contexts ?? null);
  const normalizar = (l) => JSON.stringify([...(l ?? [])].sort());
  const checksIguais = detalhados
    ? normalizar((checksVivos ?? []).map((c) => c.context)) === normalizar(detalhados.map((c) => c.context))
    : normalizar(checksVivos) === normalizar(bp.required_status_checks);
  if (checks.strict !== bp.strict || !checksIguais) {
    planos.push({
      descricao: `branch protection required_status_checks (strict=${bp.strict})`,
      metodo: 'PATCH',
      path: `/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection/required_status_checks`,
      corpo: corpoChecks,
    });
  }
  // GA89: selected-actions do baseline (endpoint correto, ver GA75). O PUT
  // recebe a lista completa + github_owned_allowed.
  const sel = await ler(`/repos/${OWNER}/${REPO_NAME}/actions/permissions/selected-actions`);
  const semArroba = (p) => String(p).replace(/@\*$/, '');
  const vivos = [...(sel?.patterns_allowed ?? [])].map(semArroba).sort();
  const esperados = [...(baseline.selected_actions_patterns ?? [])].map(semArroba).sort();
  if (vivos.join('|') !== esperados.join('|')) {
    planos.push({
      descricao: `selected actions (${esperados.length} patterns)`,
      metodo: 'PUT',
      path: `/repos/${OWNER}/${REPO_NAME}/actions/permissions/selected-actions`,
      corpo: {
        github_owned_allowed: baseline.github_owned_allowed ?? true,
        patterns_allowed: esperados,
      },
    });
  }
  if ((protection?.enforce_admins?.enabled ?? null) !== bp.enforce_admins) {
    planos.push({
      descricao: 'branch protection enforce_admins',
      metodo: 'PATCH',
      path: `/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection/enforce_admins`,
      corpo: { enabled: bp.enforce_admins },
    });
  }

  const repo = await ler(`/repos/${OWNER}/${REPO_NAME}`);
  const corpoRepo = {};
  for (const [campo, esperado] of Object.entries(baseline.merge ?? {})) {
    if ((repo ?? {})[campo] !== esperado) corpoRepo[campo] = esperado;
  }
  if (Object.keys(corpoRepo).length > 0) {
    planos.push({
      descricao: `repo merge settings (${Object.keys(corpoRepo).join(', ')})`,
      metodo: 'PATCH',
      path: `/repos/${OWNER}/${REPO_NAME}`,
      corpo: corpoRepo,
    });
  }
  return planos;
}

async function main() {
  if (!TOKEN) {
    console.error('::error::sem token (PERIMETER_APPLY_TOKEN ou GITHUB_TOKEN) — nem o dry-run le o vivo sem autenticacao.');
    process.exit(1);
  }
  if (QUER_APLICAR && CONFIRM !== 'APLICAR-PERIMETRO') {
    console.error('::error::--apply exige --confirm=APLICAR-PERIMETRO (protecao contra apply acidental).');
    process.exit(1);
  }
  const planos = await planejar();
  if (planos.length === 0) {
    console.log('✅ Dry-run sem diferenca: o vivo esta igual ao baseline.');
    return;
  }
  for (const p of planos) {
    console.log(`PATCH ${p.metodo} ${p.path}\n  ${p.descricao}\n  corpo: ${JSON.stringify(p.corpo)}`);
  }
  if (!QUER_APLICAR) {
    console.log(`\nDry-run: ${planos.length} PATCH(s) planejado(s), nada aplicado. Para aplicar: --apply --confirm=APLICAR-PERIMETRO.`);
    return;
  }
  for (const p of planos) {
    await api(p.path, p.metodo, p.corpo);
    console.log(`Aplicado: ${p.descricao}`);
  }
  console.log(`✅ Perimetro aplicado (${planos.length} PATCH(s)). Rodar o settings-guard para confirmar.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
