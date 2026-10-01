#!/usr/bin/env node
/**
 * E13/E14: Verifica e restaura configurações obrigatórias da branch protection da main.
 *
 * Política esperada:
 *   - required_status_checks.strict = true
 *   - repo.allow_auto_merge         = true
 *
 * Se houver regressão: restaura via API, abre/atualiza issue [settings-guard].
 * Se tudo OK: fecha a issue [settings-guard] se estiver aberta.
 */

const REPO = process.env.GITHUB_REPOSITORY ?? 'adm01-debug/Zapp_Web_V2';
const TOKEN = process.env.GITHUB_TOKEN;
const [OWNER, REPO_NAME] = REPO.split('/');

const ISSUE_LABEL = 'settings-guard';
const ISSUE_TITLE = '[settings-guard] branch protection regression detected';
const BRANCH = 'main';

if (!TOKEN) {
  console.error('::error::GITHUB_TOKEN ausente');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'settings-guard/1.0',
};

async function gh(method, path, body) {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return null;
  return res.json().catch(() => null);
}

async function getBranchProtection() {
  return gh('GET', `/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection`);
}

async function getRepo() {
  return gh('GET', `/repos/${OWNER}/${REPO_NAME}`);
}

async function patchRequiredStatusChecks(strict) {
  const protection = await getBranchProtection();
  const contexts = protection?.required_status_checks?.contexts ?? [];
  return gh('PATCH', `/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection/required_status_checks`, {
    strict,
    contexts,
  });
}

async function patchRepoAllowAutoMerge(allow) {
  return gh('PATCH', `/repos/${OWNER}/${REPO_NAME}`, { allow_auto_merge: allow });
}

async function findSettingsGuardIssue() {
  const issues = await gh('GET', `/repos/${OWNER}/${REPO_NAME}/issues?labels=${ISSUE_LABEL}&state=open&per_page=5`);
  return Array.isArray(issues) ? issues.find((i) => i.title === ISSUE_TITLE) ?? null : null;
}

async function openOrUpdateIssue(body) {
  const existing = await findSettingsGuardIssue();
  if (existing) {
    await gh('POST', `/repos/${OWNER}/${REPO_NAME}/issues/${existing.number}/comments`, { body });
    console.log(`Issue #${existing.number} atualizada com novo comentário.`);
    return existing.number;
  }
  // Ensure label exists
  await gh('POST', `/repos/${OWNER}/${REPO_NAME}/labels`, {
    name: ISSUE_LABEL,
    color: 'e11d48',
    description: 'Branch protection regression detected by settings-guard',
  }).catch(() => {}); // ignore if already exists
  const issue = await gh('POST', `/repos/${OWNER}/${REPO_NAME}/issues`, {
    title: ISSUE_TITLE,
    body,
    labels: [ISSUE_LABEL],
  });
  console.log(`Issue #${issue.number} aberta.`);
  return issue.number;
}

async function closeSettingsGuardIssue() {
  const existing = await findSettingsGuardIssue();
  if (!existing) return;
  await gh('PATCH', `/repos/${OWNER}/${REPO_NAME}/issues/${existing.number}`, {
    state: 'closed',
    state_reason: 'completed',
  });
  await gh('POST', `/repos/${OWNER}/${REPO_NAME}/issues/${existing.number}/comments`, {
    body: '✅ Configurações restauradas — fechando automaticamente.',
  });
  console.log(`Issue #${existing.number} fechada.`);
}

async function main() {
  const [protection, repo] = await Promise.all([getBranchProtection(), getRepo()]);

  const strict = protection?.required_status_checks?.strict ?? null;
  const allowAutoMerge = repo?.allow_auto_merge ?? null;

  console.log(`strict=${strict}  allow_auto_merge=${allowAutoMerge}`);

  const regressions = [];
  if (strict !== true) regressions.push(`required_status_checks.strict esperado=true atual=${strict}`);
  if (allowAutoMerge !== true) regressions.push(`allow_auto_merge esperado=true atual=${allowAutoMerge}`);

  if (regressions.length === 0) {
    console.log('✅ Configurações OK — nenhuma regressão detectada.');
    await closeSettingsGuardIssue();
    return;
  }

  console.log(`::warning::Regressão detectada: ${regressions.join(' | ')}`);

  // Restore
  const restored = [];
  if (strict !== true) {
    await patchRequiredStatusChecks(true);
    restored.push('`required_status_checks.strict` restaurado para `true`');
    console.log('Restaurado: strict=true');
  }
  if (allowAutoMerge !== true) {
    await patchRepoAllowAutoMerge(true);
    restored.push('`allow_auto_merge` restaurado para `true`');
    console.log('Restaurado: allow_auto_merge=true');
  }

  const body = [
    '## ⚠️ Regressão de branch protection detectada e restaurada',
    '',
    '| Campo | Esperado | Encontrado |',
    '|---|---|---|',
    ...regressions.map((r) => {
      const [field, , , found] = r.split(/[= ]/);
      return `| \`${field}\` | \`true\` | \`${found}\` |`;
    }),
    '',
    '### Restaurações aplicadas',
    ...restored.map((r) => `- ${r}`),
    '',
    `Run: https://github.com/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID ?? 'manual'}`,
    `Timestamp: ${new Date().toISOString()}`,
  ].join('\n');

  await openOrUpdateIssue(body);
  process.exit(1);
}

main().catch((e) => {
  console.error('::error::' + e.message);
  process.exit(1);
});
