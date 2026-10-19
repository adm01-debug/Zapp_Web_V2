#!/usr/bin/env node
/**
 * GA80: aplicar-perimetro.mjs — aplica o baseline de perímetro do GitHub
 * (`github-settings-baseline.json`) ao repositório via API.
 *
 * Modo padrão: dry-run — lê o estado vivo, compara com o baseline e imprime a
 * diferença. Sai 0 quando não há diferença, 1 quando há.
 *
 * Com --apply: aplica as diferenças via PATCH/PUT. Exige token com escopo
 * `administration` (write) — ADMIN_WRITE_TOKEN ou GITHUB_TOKEN com esse escopo.
 *
 * Por que existe: `strict` regrediu 4 vezes e CodeQL entrou no baseline via API
 * manual sem passagem por PR. Este script é a única forma autorizada de alterar
 * o perímetro; o CLAUDE.md proíbe PATCH manual fora dele.
 *
 * Uso:
 *   ADMIN_WRITE_TOKEN=ghp_... node scripts/ci/aplicar-perimetro.mjs
 *   ADMIN_WRITE_TOKEN=ghp_... node scripts/ci/aplicar-perimetro.mjs --apply
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPO = process.env.GITHUB_REPOSITORY ?? 'adm01-debug/Zapp_Web_V2';
const TOKEN = (process.env.ADMIN_WRITE_TOKEN || process.env.GITHUB_TOKEN || '').trim();
const APPLY = process.argv.includes('--apply');
const [OWNER, REPO_NAME] = REPO.split('/');

if (!TOKEN) {
  console.error('ADMIN_WRITE_TOKEN ou GITHUB_TOKEN é obrigatório.');
  process.exit(1);
}

const baseline = JSON.parse(
  readFileSync(new URL('./github-settings-baseline.json', import.meta.url), 'utf8'),
);

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'aplicar-perimetro/1.0',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

// GA76/GraphQL: campos de merge via GraphQL (GET /repos omite com token sem push)
async function ghGraphQL(query) {
  const raw = await gh('POST', '/graphql', { query });
  if (raw?.errors?.length) throw new Error(raw.errors.map((e) => e.message).join('; '));
  return raw?.data ?? null;
}

const porCodigo = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ─── lerEstadoVivo ─────────────────────────────────────────────────────────

async function lerBranchProtection() {
  try {
    return await gh('GET', `/repos/${OWNER}/${REPO_NAME}/branches/main/protection`);
  } catch (e) {
    if (e.message.includes('403') || e.message.includes('404')) return null;
    throw e;
  }
}

async function lerRepoMerge() {
  const gql = `{ repository(owner:"${OWNER}",name:"${REPO_NAME}"){
    squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed autoMergeAllowed
    deleteBranchOnMerge squashMergeCommitMessage squashMergeCommitTitle
  }}`;
  const data = await ghGraphQL(gql).catch(() => null);
  return data?.repository ?? null;
}

async function lerActionsPermissions() {
  return gh('GET', `/repos/${OWNER}/${REPO_NAME}/actions/permissions`).catch(() => null);
}

async function lerSelectedActions() {
  return gh('GET', `/repos/${OWNER}/${REPO_NAME}/actions/permissions/selected-actions`).catch(() => null);
}

async function lerWorkflowPermissions() {
  return gh('GET', `/repos/${OWNER}/${REPO_NAME}/actions/permissions/workflow`).catch(() => null);
}

// ─── calcularDiff ──────────────────────────────────────────────────────────

function diffBranchProtection(vivo, bl) {
  const diffs = [];
  if (!vivo) {
    diffs.push({ campo: 'branch_protection', esperado: bl, encontrado: 'leitura negada (403/404) — token sem escopo administration:read' });
    return diffs;
  }
  const checks = vivo.required_status_checks ?? null;
  const checksOff = checks === null || typeof checks !== 'object';

  // strict
  const strictVivo = checksOff ? null : (checks.strict ?? null);
  if (strictVivo !== bl.strict) diffs.push({ campo: 'strict', esperado: bl.strict, encontrado: strictVivo });

  // enforce_admins
  const enforceVivo = vivo.enforce_admins?.enabled ?? null;
  if (enforceVivo !== bl.enforce_admins) diffs.push({ campo: 'enforce_admins', esperado: bl.enforce_admins, encontrado: enforceVivo });

  // allow_force_pushes
  const forceVivo = vivo.allow_force_pushes?.enabled ?? false;
  if (forceVivo !== bl.allow_force_pushes) diffs.push({ campo: 'allow_force_pushes', esperado: bl.allow_force_pushes, encontrado: forceVivo });

  // required_linear_history
  const linearVivo = vivo.required_linear_history?.enabled ?? false;
  if (linearVivo !== bl.required_linear_history) diffs.push({ campo: 'required_linear_history', esperado: bl.required_linear_history, encontrado: linearVivo });

  // required_status_checks — GA03: comparar com app_id
  const vivoChecks = checksOff ? [] : [...(checks.checks ?? checks.contexts?.map(c => ({ context: c })) ?? [])];
  const vivoContexts = vivoChecks.map(c => (typeof c === 'string' ? c : c.context)).sort(porCodigo);
  const blItems = [...(bl.required_status_checks ?? [])];
  const blContexts = blItems.map(i => (typeof i === 'string' ? i : i.context)).sort(porCodigo);

  if (JSON.stringify(vivoContexts) !== JSON.stringify(blContexts)) {
    diffs.push({ campo: 'required_status_checks.contexts', esperado: blContexts, encontrado: vivoContexts });
  } else {
    // contextos iguais — verificar app_id
    for (const blItem of blItems) {
      if (typeof blItem === 'string') continue;
      const ctx = blItem.context;
      const vivoItem = vivoChecks.find(c => (typeof c === 'string' ? c : c.context) === ctx);
      const vivoAppId = typeof vivoItem === 'string' ? null : (vivoItem?.app_id ?? null);
      if (vivoAppId !== blItem.app_id) {
        diffs.push({ campo: `required_status_checks[${ctx}].app_id`, esperado: blItem.app_id, encontrado: vivoAppId });
      }
    }
  }
  return diffs;
}

function diffMerge(vivo, bl) {
  if (!vivo) return [];
  const MAP = {
    allow_squash_merge: 'squashMergeAllowed',
    allow_merge_commit: 'mergeCommitAllowed',
    allow_rebase_merge: 'rebaseMergeAllowed',
    allow_auto_merge: 'autoMergeAllowed',
    delete_branch_on_merge: 'deleteBranchOnMerge',
    squash_merge_commit_message: 'squashMergeCommitMessage',
    squash_merge_commit_title: 'squashMergeCommitTitle',
  };
  return Object.entries(bl.merge ?? {}).flatMap(([k, esperado]) => {
    const gqlKey = MAP[k];
    if (!gqlKey) return [];
    const encontrado = vivo[gqlKey] ?? null;
    return encontrado !== null && encontrado !== esperado
      ? [{ campo: `merge.${k}`, esperado, encontrado }]
      : [];
  });
}

function diffActions(vivo, bl) {
  if (!vivo || !bl.actions) return [];
  const diffs = [];
  if (vivo.allowed_actions !== undefined && vivo.allowed_actions !== bl.actions.allowed_actions)
    diffs.push({ campo: 'actions.allowed_actions', esperado: bl.actions.allowed_actions, encontrado: vivo.allowed_actions });
  return diffs;
}

function diffWorkflowPermissions(vivo, bl) {
  if (!vivo || !bl.workflow_permissions) return [];
  const diffs = [];
  const bwp = bl.workflow_permissions;
  if (vivo.default_workflow_permissions !== undefined && vivo.default_workflow_permissions !== bwp.default_workflow_permissions)
    diffs.push({ campo: 'workflow_permissions.default_workflow_permissions', esperado: bwp.default_workflow_permissions, encontrado: vivo.default_workflow_permissions });
  if (vivo.can_approve_pull_request_reviews !== undefined && vivo.can_approve_pull_request_reviews !== bwp.can_approve_pull_request_reviews)
    diffs.push({ campo: 'workflow_permissions.can_approve_pull_request_reviews', esperado: bwp.can_approve_pull_request_reviews, encontrado: vivo.can_approve_pull_request_reviews });
  return diffs;
}

// ─── aplicar ──────────────────────────────────────────────────────────────

async function aplicarBranchProtection() {
  const bl = baseline.branch_protection_main;
  const body = {
    required_status_checks: {
      strict: bl.strict,
      checks: bl.required_status_checks.map(i =>
        typeof i === 'string' ? { context: i } : { context: i.context, app_id: i.app_id }
      ),
    },
    enforce_admins: bl.enforce_admins,
    required_pull_request_reviews: null,
    restrictions: null,
    allow_force_pushes: bl.allow_force_pushes ?? false,
    required_linear_history: bl.required_linear_history ?? false,
  };
  await gh('PUT', `/repos/${OWNER}/${REPO_NAME}/branches/main/protection`, body);
  console.log('  ✓ branch protection aplicada');
}

async function aplicarMerge() {
  const bl = baseline.merge;
  const body = {
    allow_squash_merge: bl.allow_squash_merge,
    allow_merge_commit: bl.allow_merge_commit,
    allow_rebase_merge: bl.allow_rebase_merge,
    allow_auto_merge: bl.allow_auto_merge,
    delete_branch_on_merge: bl.delete_branch_on_merge,
    squash_merge_commit_message: bl.squash_merge_commit_message,
    squash_merge_commit_title: bl.squash_merge_commit_title,
  };
  await gh('PATCH', `/repos/${OWNER}/${REPO_NAME}`, body);
  console.log('  ✓ configurações de merge aplicadas');
}

async function aplicarActions() {
  const bl = baseline.actions;
  await gh('PUT', `/repos/${OWNER}/${REPO_NAME}/actions/permissions`, {
    enabled: bl.enabled,
    allowed_actions: bl.allowed_actions,
  });
  console.log('  ✓ actions permissions aplicadas');
}

async function aplicarWorkflowPermissions() {
  const bwp = baseline.workflow_permissions;
  await gh('PUT', `/repos/${OWNER}/${REPO_NAME}/actions/permissions/workflow`, {
    default_workflow_permissions: bwp.default_workflow_permissions,
    can_approve_pull_request_reviews: bwp.can_approve_pull_request_reviews,
  });
  console.log('  ✓ workflow permissions aplicadas');
}

// ─── main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Perímetro do GitHub — ${APPLY ? 'APLICAR' : 'dry-run'}`);
  console.log(`Repositório: ${OWNER}/${REPO_NAME}\n`);

  const [protection, repoMerge, actionsPerms, workflowPerms] = await Promise.all([
    lerBranchProtection(),
    lerRepoMerge(),
    lerActionsPermissions(),
    lerWorkflowPermissions(),
  ]);

  const todosOsDiffs = [
    ...diffBranchProtection(protection, baseline.branch_protection_main),
    ...diffMerge(repoMerge, baseline),
    ...diffActions(actionsPerms, baseline),
    ...diffWorkflowPermissions(workflowPerms, baseline),
  ];

  if (todosOsDiffs.length === 0) {
    console.log('✅ Sem diferenças — perímetro igual ao baseline.');
    return;
  }

  console.log(`⚠️  ${todosOsDiffs.length} diferença(s) encontrada(s):\n`);
  for (const d of todosOsDiffs) {
    console.log(`  ${d.campo}`);
    console.log(`    esperado:  ${JSON.stringify(d.esperado)}`);
    console.log(`    encontrado: ${JSON.stringify(d.encontrado)}`);
  }
  console.log('');

  if (!APPLY) {
    console.log('Modo dry-run — nada foi alterado. Use --apply para aplicar.');
    process.exit(1);
  }

  // aplicar
  const camposBranchProtection = todosOsDiffs.filter(d =>
    d.campo.startsWith('branch_protection') || d.campo.startsWith('strict') ||
    d.campo.startsWith('enforce_admins') || d.campo.startsWith('allow_force') ||
    d.campo.startsWith('required_linear') || d.campo.startsWith('required_status')
  );
  const camposMerge = todosOsDiffs.filter(d => d.campo.startsWith('merge.'));
  const camposActions = todosOsDiffs.filter(d => d.campo.startsWith('actions.'));
  const camposWorkflow = todosOsDiffs.filter(d => d.campo.startsWith('workflow_permissions.'));

  if (camposBranchProtection.length > 0) await aplicarBranchProtection();
  if (camposMerge.length > 0) await aplicarMerge();
  if (camposActions.length > 0) await aplicarActions();
  if (camposWorkflow.length > 0) await aplicarWorkflowPermissions();

  console.log('\n✅ Perímetro restaurado com sucesso.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
