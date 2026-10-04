#!/usr/bin/env node
/**
 * E13/E14 + E95: confere o perimetro do GitHub contra o baseline versionado
 * (`github-settings-baseline.json`) e restaura o que sabe restaurar.
 *
 * Política esperada (baseline):
 *   - branch protection da main: strict=true, enforce_admins=true
 *   - repo: allow_auto_merge=true, squash-only, delete_branch_on_merge
 *   - actions: allowed_actions=selected, sha_pinning_required=true
 *
 * Regressão: restaura via PATCH (o que suporta) e abre/atualiza a issue
 * [settings-guard]. Tudo OK: fecha a issue se estiver aberta.
 *
 * E95 — o que mudou, e por quê: a versão anterior fazia
 * `GET /branches/main/protection` e deixava o erro subir. O `GITHUB_TOKEN` de
 * workflow NÃO tem o escopo `administration`, então esse GET responde
 * 403 "Resource not accessible by integration" — e o guard morria ali, antes de
 * comparar qualquer coisa e sem abrir a issue que deveria abrir. Medido em
 * 03/10/2026: 6 runs, 6 falhas desde a criação, zero proteção efetiva.
 *
 * Agora: campo que não dá para ler vira **não verificável** (com o motivo e o
 * que fazer), nunca falha silenciosa — e a issue é aberta de qualquer forma,
 * porque "não consegui olhar" é justamente o que precisa de gente.
 */

import { readFileSync } from 'node:fs';

const REPO = process.env.GITHUB_REPOSITORY ?? 'adm01-debug/Zapp_Web_V2';
const TOKEN = process.env.GITHUB_TOKEN;
const [OWNER, REPO_NAME] = REPO.split('/');

const ISSUE_LABEL = 'settings-guard';
const ISSUE_TITLE = '[settings-guard] perimeter regression detected';
const BRANCH = 'main';

const baseline = JSON.parse(
  readFileSync(new URL('./github-settings-baseline.json', import.meta.url), 'utf8'),
);

// jssecurity:S5145 — valores vindos da API do GitHub entram no log em #92/#115/#127.
// Quebras de linha / caracteres de controle são neutralizados para impedir que
// esse conteúdo forje linhas de log. Valores normais (números, booleanos) ficam iguais.
const semQuebra = (valor) => String(valor).replace(/[\r\n\u0000-\u001f\u007f]/g, ' ');

if (!TOKEN) {
  console.error('::error::GITHUB_TOKEN ausente');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'settings-guard/2.0',
};

/** Erro de leitura por falta de escopo — não é regressão, é ponto cego. */
class NaoVerificavel extends Error {
  constructor(caminho, status, motivo) {
    super(`${status} em ${caminho}: ${motivo}`);
    this.caminho = caminho;
    this.status = status;
  }
}

async function gh(method, path, body) {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 403 || res.status === 404) {
    const text = await res.text().catch(() => '');
    // 404 aqui também costuma ser escopo, não ausência: a API esconde o recurso.
    throw new NaoVerificavel(path, res.status, text.slice(0, 200));
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return null;
  return res.json().catch(() => null);
}

// ---------------------------------------------------------------- checagens
// Cada checagem devolve { campo, esperado, encontrado } ou lança NaoVerificavel.
// `restauravel` diz se o guard sabe desfazer a divergência sozinho.

async function checarBranchProtection() {
  const protection = await gh('GET', `/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection`);
  const esperado = baseline.branch_protection_main;
  const divergencias = [];

  const strict = protection?.required_status_checks?.strict ?? null;
  if (strict !== esperado.strict) {
    divergencias.push({ campo: 'branch_protection_main.strict', esperado: esperado.strict, encontrado: strict, restauravel: true });
  }

  const enforceAdmins = protection?.enforce_admins?.enabled ?? null;
  if (enforceAdmins !== esperado.enforce_admins) {
    divergencias.push({ campo: 'branch_protection_main.enforce_admins', esperado: esperado.enforce_admins, encontrado: enforceAdmins, restauravel: false });
  }

  const contexts = [...(protection?.required_status_checks?.contexts ?? [])].sort();
  const esperados = [...esperado.required_status_checks].sort();
  if (contexts.join('|') !== esperados.join('|')) {
    divergencias.push({
      campo: 'branch_protection_main.required_status_checks',
      esperado: esperados.join(', '),
      encontrado: contexts.join(', ') || '(nenhum)',
      restauravel: false,
    });
  }
  return divergencias;
}

async function checarRepo() {
  const repo = await gh('GET', `/repos/${OWNER}/${REPO_NAME}`);
  const divergencias = [];
  for (const [campo, esperado] of Object.entries(baseline.merge)) {
    const encontrado = repo?.[campo] ?? null;
    if (encontrado !== esperado) {
      divergencias.push({ campo: `merge.${campo}`, esperado, encontrado, restauravel: campo === 'allow_auto_merge' });
    }
  }
  return divergencias;
}

async function checarActions() {
  const perms = await gh('GET', `/repos/${OWNER}/${REPO_NAME}/actions/permissions`);
  const divergencias = [];
  for (const [campo, esperado] of Object.entries(baseline.actions)) {
    const encontrado = perms?.[campo] ?? null;
    if (encontrado !== esperado) {
      divergencias.push({ campo: `actions.${campo}`, esperado, encontrado, restauravel: false });
    }
  }
  return divergencias;
}

async function checarEnvironments() {
  const dados = await gh('GET', `/repos/${OWNER}/${REPO_NAME}/environments`);
  const encontrados = (dados?.environments ?? []).map((e) => e.name).sort();
  const esperados = [...baseline.environments].sort();
  // Environment a mais é pendência da E94, não regressão de agora: só avisa.
  const faltando = esperados.filter((e) => !encontrados.includes(e));
  if (faltando.length === 0) return [];
  return [{
    campo: 'environments',
    esperado: esperados.join(', '),
    encontrado: encontrados.join(', ') || '(nenhum)',
    restauravel: false,
  }];
}

// ---------------------------------------------------------------- restauração

async function restaurar(campo) {
  if (campo === 'branch_protection_main.strict') {
    const protection = await gh('GET', `/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection`);
    const contexts = protection?.required_status_checks?.contexts ?? [];
    await gh('PATCH', `/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection/required_status_checks`, {
      strict: true,
      contexts,
    });
    return '`branch_protection_main.strict` restaurado para `true`';
  }
  if (campo === 'merge.allow_auto_merge') {
    await gh('PATCH', `/repos/${OWNER}/${REPO_NAME}`, { allow_auto_merge: true });
    return '`merge.allow_auto_merge` restaurado para `true`';
  }
  return null;
}

// ---------------------------------------------------------------- issue

async function findIssue() {
  const issues = await gh('GET', `/repos/${OWNER}/${REPO_NAME}/issues?labels=${ISSUE_LABEL}&state=open&per_page=10`);
  return Array.isArray(issues) ? issues.find((i) => i.title === ISSUE_TITLE) ?? null : null;
}

async function abrirOuAtualizarIssue(body) {
  const existing = await findIssue();
  if (existing) {
    await gh('POST', `/repos/${OWNER}/${REPO_NAME}/issues/${existing.number}/comments`, { body });
    console.log(`Issue #${semQuebra(existing.number)} atualizada com novo comentario.`);
    return existing.number;
  }
  await gh('POST', `/repos/${OWNER}/${REPO_NAME}/labels`, {
    name: ISSUE_LABEL,
    color: 'e11d48',
    description: 'Perimeter regression detected by settings-guard',
  }).catch(() => {});
  const issue = await gh('POST', `/repos/${OWNER}/${REPO_NAME}/issues`, {
    title: ISSUE_TITLE,
    body,
    labels: [ISSUE_LABEL],
  });
  console.log(`Issue #${semQuebra(issue.number)} aberta.`);
  return issue.number;
}

async function fecharIssue() {
  const existing = await findIssue();
  if (!existing) return;
  await gh('PATCH', `/repos/${OWNER}/${REPO_NAME}/issues/${existing.number}`, {
    state: 'closed',
    state_reason: 'completed',
  });
  await gh('POST', `/repos/${OWNER}/${REPO_NAME}/issues/${existing.number}/comments`, {
    body: '✅ Perimetro conferido contra o baseline — fechando automaticamente.',
  });
  console.log(`Issue #${existing.number} fechada.`);
}

// ---------------------------------------------------------------- principal

async function main() {
  const checagens = [
    ['branch protection', checarBranchProtection],
    ['merge/repo', checarRepo],
    ['actions', checarActions],
    ['environments', checarEnvironments],
  ];

  const divergencias = [];
  const naoVerificaveis = [];

  for (const [nome, fn] of checagens) {
    try {
      const encontradas = await fn();
      console.log(`${nome}: ${encontradas.length === 0 ? 'OK' : `${encontradas.length} divergencia(s)`}`);
      divergencias.push(...encontradas);
    } catch (e) {
      if (e instanceof NaoVerificavel) {
        // Ponto cego declarado: não é regressão, mas precisa aparecer.
        console.log(`::warning::${nome}: NAO VERIFICAVEL — ${semQuebra(e.message)}`);
        naoVerificaveis.push({ nome, motivo: `${e.status} — ${e.message.split(': ').slice(1).join(': ')}` });
      } else {
        throw e;
      }
    }
  }

  for (const d of divergencias) {
    console.log(`divergencia: ${semQuebra(d.campo)} esperado=${semQuebra(d.esperado)} encontrado=${semQuebra(d.encontrado)}`);
  }

  if (divergencias.length === 0 && naoVerificaveis.length === 0) {
    console.log('✅ Perimetro OK — nenhuma regressao detectada.');
    await fecharIssue();
    return;
  }

  // Restaura só o que o guard sabe restaurar; o resto vira alerta.
  const restaurados = [];
  for (const d of divergencias.filter((x) => x.restauravel)) {
    try {
      const feito = await restaurar(d.campo);
      if (feito) {
        restaurados.push(feito);
        console.log(`Restaurado: ${semQuebra(d.campo)}`);
      }
    } catch (e) {
      restaurados.push(`⚠️ falhou ao restaurar \`${d.campo}\`: ${e.message.split(':')[0]}`);
    }
  }

  const linhas = [
    '## ⚠️ Divergência de perímetro detectada',
    '',
    `Baseline: \`scripts/ci/github-settings-baseline.json\` (medido em ${baseline.medido_em})`,
    '',
  ];

  if (divergencias.length > 0) {
    linhas.push(
      '### Divergências',
      '',
      '| Campo | Esperado | Encontrado |',
      '|---|---|---|',
      ...divergencias.map(
        (d) =>
          `| \`${semQuebra(d.campo)}\` | \`${semQuebra(d.esperado)}\` | \`${semQuebra(d.encontrado)}\` |`,
      ),
      '',
    );
  }

  if (naoVerificaveis.length > 0) {
    linhas.push(
      '### Não verificável com o token do workflow',
      '',
      'Estes campos **não puderam ser conferidos** — a API exige escopo que o `GITHUB_TOKEN` não tem.',
      'Não é "está tudo certo": é "não consegui olhar".',
      '',
      '| Checagem | Motivo |',
      '|---|---|',
      ...naoVerificaveis.map((n) => `| ${n.nome} | ${n.motivo.replace(/\|/g, '/')} |`),
      '',
    );
  }

  if (restaurados.length > 0) {
    linhas.push('### Restaurações aplicadas', '', ...restaurados.map((r) => `- ${r}`), '');
  }

  linhas.push(
    `Run: https://github.com/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID ?? 'manual'}`,
    `Timestamp: ${new Date().toISOString()}`,
  );

  await abrirOuAtualizarIssue(linhas.join('\n'));
  process.exit(1);
}

main().catch((e) => {
  console.error('::error::' + e.message);
  process.exit(1);
});
