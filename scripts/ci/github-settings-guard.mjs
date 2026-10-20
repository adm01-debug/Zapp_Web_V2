#!/usr/bin/env node
/**
 * E13/E14 + E95: confere o perimetro do GitHub contra o baseline versionado
 * (`github-settings-baseline.json`) e abre/atualiza a issue de alerta.
 * GA77: o guard NAO restaura nada sozinho — PATCH (manual ou automatico) fora
 * de script versionado e proibido (CLAUDE.md, secao 0). Divergencia vira alerta
 * para gente; a aplicacao do perimetro vive em `scripts/ci/aplicar-perimetro.mjs`
 * (GA80) e exige aprovacao.
 *
 * Política esperada (baseline):
 *   - branch protection da main: strict=true, enforce_admins=true
 *   - repo: allow_auto_merge=true, squash-only, delete_branch_on_merge
 *   - actions: allowed_actions=selected, sha_pinning_required=true
 *
 * Divergência: abre/atualiza a issue [settings-guard] (sem PATCH automatico).
 * Tudo OK: fecha a issue se estiver aberta.
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
 *
 * W04/W05 (plano de 14/10/2026) — o que mudou, e por quê: medido em 14/10, o
 * guard falhava 30 de 30 runs em 7 dias com "7 divergencia(s)" em `merge.*`,
 * todas `encontrado=null`. O `GET /repos` com `GITHUB_TOKEN` responde 200 mas
 * **omite** `allow_auto_merge`, `allow_squash_merge` etc. (campos que exigem
 * permissao push/admin). Campo ausente nao e divergencia: e ponto cego, e passa
 * a ser tratado como tal. E quando SO ha ponto cego (nada divergiu de fato), o
 * run sai 0 com `::warning::` e a issue recebe UM comentario por assinatura
 * (conjunto de campos cegos) a cada 7 dias — nao um a cada 6 h, que foi o que
 * levou a issue #1854 a 39 comentarios de bot e a politica E51 a ser violada.
 * Divergencia real continua saindo 1 e comentando (com dedupe de 6 h por causa).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
// GA78: rotina unica de issue de alerta (dedupe + rotacao E51/W91).
import { abrirOuRotacionar, encontrarIssue, fecharSeAberta } from './issue-rotativa.mjs';

const REPO = process.env.GITHUB_REPOSITORY ?? 'adm01-debug/Zapp_Web_V2';
const TOKEN = process.env.GITHUB_TOKEN;
// W11/W12: PAT fine-grained com administration:read (secret `SETTINGS_GUARD_TOKEN` do
// environment `perimetro-leitura`) para remover o ponto cego de branch protection.
// `||`, NUNCA `??`: secret ausente chega ao processo como string VAZIA, nao `undefined`,
// e com `??` o guard mandava `Authorization: Bearer ` (401, job vermelho) em vez de
// cair no GITHUB_TOKEN. O workflow tambem passa `SETTINGS_GUARD_TOKEN || github.token`;
// a comparacao com TOKEN distingue "dedicado" de "fallback" nos dois casos.
const ADMIN_TOKEN_DEDICADO = (process.env.ADMIN_READ_TOKEN || '').trim();
const TEM_ADMIN_DEDICADO = ADMIN_TOKEN_DEDICADO !== '' && ADMIN_TOKEN_DEDICADO !== TOKEN;
let adminToken = TEM_ADMIN_DEDICADO ? ADMIN_TOKEN_DEDICADO : TOKEN;
let adminRejeitado = false;
const RUNBOOK_SEGREDOS = 'docs/runbooks/migracao-segredos-environments.md';
const [OWNER, REPO_NAME] = REPO.split('/');

const ISSUE_LABEL = 'settings-guard';
const ISSUE_TITLE = '[settings-guard] perimeter regression detected';
const BRANCH = 'main';
// W05: so comentarios escritos pelo proprio guard contam para o dedupe. Repo publico:
// qualquer pessoa pode colar o marcador `<!-- causa:... -->` num comentario e, sem esta
// checagem, silenciar o alerta por 6 h / 7 dias (achado do Codex na PR #1920). O GITHUB_TOKEN
// de workflow comenta como `github-actions[bot]`; outro autor so via variavel explicita.
const AUTOR_DO_GUARD = process.env.SETTINGS_GUARD_AUTOR ?? 'github-actions[bot]';

const baseline = JSON.parse(
  readFileSync(new URL('./github-settings-baseline.json', import.meta.url), 'utf8'),
);

// jssecurity:S5145 — valores vindos da API do GitHub entram no log em #92/#115/#127.
// Quebras de linha / caracteres de controle são neutralizados para impedir que
// esse conteúdo forje linhas de log. Valores normais (números, booleanos) ficam iguais.
const semQuebra = (valor) => String(valor).replace(/[\r\n\u0000-\u001f\u007f]/g, ' ');

// javascript:S2871 — `.sort()` sem comparador. Ordem por código de caractere, deliberadamente
// NÃO `localeCompare`: a assinatura da causa (`assinaturaDe`) é um hash desta ordem e precisa
// ser a mesma em qualquer runner/locale; `localeCompare` muda com o ICU da máquina.
const porCodigo = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Erro de leitura por falta de escopo — não é regressão, é ponto cego. */
class NaoVerificavel extends Error {
  constructor(caminho, status, motivo) {
    super(`${status} em ${caminho}: ${motivo}`);
    this.caminho = caminho;
    this.status = status;
  }
}

/** 401: o token foi recusado (expirado, revogado ou malformado) — nao e falta de escopo. */
class TokenRecusado extends Error {
  constructor(caminho) {
    super(`401 em ${caminho}: token recusado`);
    this.caminho = caminho;
  }
}

async function gh(method, path, body, overrideToken) {
  const tok = overrideToken ?? TOKEN;
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'settings-guard/2.0',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new TokenRecusado(path);
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
// W11/W12: leituras administrativas usam o PAT fine-grained (administration:read);
// escritas (issues) continuam com o GITHUB_TOKEN. GA77: sem PATCH de restauracao.
// PAT recusado (401: expirou os 90 dias, foi revogado) nao derruba o guard: o resto do
// run volta ao GITHUB_TOKEN — os campos administrativos reaparecem como NAO VERIFICAVEL,
// que e o comportamento de antes do W12 — e o aviso pede a rotacao.
async function ghAdmin(method, path, body) {
  try {
    return await gh(method, path, body, adminToken);
  } catch (e) {
    if (!(e instanceof TokenRecusado) || adminToken === TOKEN) throw e;
    adminRejeitado = true;
    adminToken = TOKEN;
    console.log(
      `::warning::SETTINGS_GUARD_TOKEN recusado (401) — expirado ou revogado. Leituras administrativas voltam ao GITHUB_TOKEN neste run; rotacionar conforme ${RUNBOOK_SEGREDOS}.`,
    );
    return gh(method, path, body, adminToken);
  }
}

/** De onde vieram as leituras administrativas deste run (nunca o valor do token). */
function fonteDaLeituraAdmin() {
  if (adminRejeitado) return 'GITHUB_TOKEN (SETTINGS_GUARD_TOKEN recusado com 401 — rotacionar)';
  if (TEM_ADMIN_DEDICADO) return 'SETTINGS_GUARD_TOKEN (environment perimetro-leitura)';
  return 'GITHUB_TOKEN (SETTINGS_GUARD_TOKEN ausente — W11 pendente)';
}

// GA76: leitura via GraphQL (repository.autoMergeAllowed e irmaos). O REST
// `GET /repos` omite os campos de merge para tokens sem permissao push/admin;
// o GraphQL expos os mesmos campos sob outro conjunto de permissoes, entao o
// guard tenta os dois antes de declarar ponto cego.
async function ghGraphQL(query, variables) {
  const corpo = JSON.stringify({ query, variables });
  const tentar = async (tok) => {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'settings-guard/2.0',
        'Content-Type': 'application/json',
      },
      body: corpo,
    });
    if (res.status === 401) throw new TokenRecusado('/graphql');
    if (res.status === 403 || res.status === 404) {
      const text = await res.text().catch(() => '');
      throw new NaoVerificavel('/graphql', res.status, text.slice(0, 200));
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API POST /graphql → ${res.status}: ${text}`);
    }
    return res.json().catch(() => null);
  };
  try {
    return await tentar(adminToken);
  } catch (e) {
    if (!(e instanceof TokenRecusado) || adminToken === TOKEN) throw e;
    adminRejeitado = true;
    adminToken = TOKEN;
    console.log(
      `::warning::SETTINGS_GUARD_TOKEN recusado (401) — expirado ou revogado. Leituras administrativas voltam ao GITHUB_TOKEN neste run; rotacionar conforme ${RUNBOOK_SEGREDOS}.`,
    );
    return tentar(adminToken);
  }
}

// GA76: campos de merge legiveis por GraphQL (os dois `squash_merge_commit_*`
// so existem no REST e continuam por la).
const GRAPHQL_MERGE = {
  allow_auto_merge: 'autoMergeAllowed',
  allow_squash_merge: 'squashMergeAllowed',
  allow_merge_commit: 'mergeCommitAllowed',
  allow_rebase_merge: 'rebaseMergeAllowed',
  delete_branch_on_merge: 'deleteBranchOnMerge',
};

async function lerMergeViaGraphQL() {
  const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){autoMergeAllowed squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed deleteBranchOnMerge}}`;
  const dados = await ghGraphQL(query, { owner: OWNER, name: REPO_NAME });
  if (dados?.errors?.length) {
    throw new NaoVerificavel('/graphql', 200, dados.errors.map((e) => e.message).join('; ').slice(0, 200));
  }
  const no = dados?.data?.repository ?? null;
  if (!no || typeof no !== 'object') return null;
  const saida = {};
  for (const gql of Object.values(GRAPHQL_MERGE)) {
    if (no[gql] !== null && no[gql] !== undefined) saida[gql] = no[gql];
  }
  return saida;
}

// ---------------------------------------------------------------- checagens
// Cada checagem devolve { campo, esperado, encontrado } ou lança NaoVerificavel.
// GA77: `restauravel` e sempre false — o guard so relata, nunca desfaz.

async function checarBranchProtection() {
  const protection = await ghAdmin('GET', `/repos/${OWNER}/${REPO_NAME}/branches/${BRANCH}/protection`);
  const esperado = baseline.branch_protection_main;
  const divergencias = [];

  // W04: resposta 200 que nao e um objeto e ponto cego. Mas `required_status_checks`
  // ausente/null NAO e ponto cego: a API usa `null` para DESLIGAR os checks
  // obrigatorios (achado do Codex na PR #1920). Apagar os 6 checks tem de ser
  // regressao, nunca "campo nao lido".
  if (!protection || typeof protection !== 'object') {
    throw new NaoVerificavel(`/branches/${BRANCH}/protection`, 200, 'resposta nao e um objeto de protecao');
  }
  const checks = protection.required_status_checks ?? null;
  const checksDesligados = checks === null || typeof checks !== 'object';

  const strict = checksDesligados ? null : (checks.strict ?? null);
  if (strict !== esperado.strict) {
    divergencias.push({
      campo: 'branch_protection_main.strict',
      esperado: esperado.strict,
      encontrado: checksDesligados ? 'required_status_checks desligado' : strict,
      restauravel: false,
    });
  }

  const enforceAdmins = protection?.enforce_admins?.enabled ?? null;
  if (enforceAdmins !== esperado.enforce_admins) {
    divergencias.push({ campo: 'branch_protection_main.enforce_admins', esperado: esperado.enforce_admins, encontrado: enforceAdmins, restauravel: false });
  }

  const contexts = checksDesligados ? [] : [...(checks.contexts ?? [])].sort(porCodigo);
  const esperados = [...esperado.required_status_checks].sort(porCodigo);
  if (contexts.join('|') !== esperados.join('|')) {
    divergencias.push({
      campo: 'branch_protection_main.required_status_checks',
      esperado: esperados.join(', '),
      encontrado: contexts.join(', ') || '(nenhum)',
      restauravel: false,
    });
  }

  const linearHistory = protection?.required_linear_history?.enabled ?? null;
  if (linearHistory !== (esperado.required_linear_history ?? null)) {
    divergencias.push({ campo: 'branch_protection_main.required_linear_history', esperado: esperado.required_linear_history ?? null, encontrado: linearHistory, restauravel: false });
  }

  const allowForcePushes = protection?.allow_force_pushes?.enabled ?? null;
  if (allowForcePushes !== (esperado.allow_force_pushes ?? null)) {
    divergencias.push({ campo: 'branch_protection_main.allow_force_pushes', esperado: esperado.allow_force_pushes ?? null, encontrado: allowForcePushes, restauravel: false });
  }

  return divergencias;
}

async function checarRepo() {
  // GA76: tenta GraphQL primeiro; o que nem o GraphQL exposer cai para o REST;
  // o que nenhum dos dois exposer e ponto cego declarado (nunca divergencia).
  let gql = null;
  try {
    gql = await lerMergeViaGraphQL();
  } catch (e) {
    if (!(e instanceof NaoVerificavel)) throw e;
    console.log(`::warning::merge/repo (GraphQL): NAO VERIFICAVEL — ${e.message}`);
  }
  const repo = await ghAdmin('GET', `/repos/${OWNER}/${REPO_NAME}`);
  const divergencias = [];
  const ausentes = [];
  for (const [campo, esperado] of Object.entries(baseline.merge)) {
    // W04: o GET /repos so devolve os campos de merge para quem tem permissao
    // push/admin. Com GITHUB_TOKEN eles simplesmente NAO vem — `null`/ausente
    // aqui e "nao consegui ler", nunca "esta diferente".
    let encontrado;
    let legivel = false;
    if (repo && typeof repo === 'object' && Object.hasOwn(repo, campo) && repo[campo] !== null) {
      encontrado = repo[campo];
      legivel = true;
    } else if (gql && GRAPHQL_MERGE[campo] && Object.hasOwn(gql, GRAPHQL_MERGE[campo])) {
      encontrado = gql[GRAPHQL_MERGE[campo]];
      legivel = true;
    }
    if (!legivel) {
      ausentes.push(campo);
      continue;
    }
    if (encontrado !== esperado) {
      divergencias.push({ campo: `merge.${campo}`, esperado, encontrado, restauravel: false });
    }
  }
  // W14: security_and_analysis (secret_scanning*) — avaliado mesmo com cegueira
  // parcial nos campos de merge (antes, o `return` antecipado pulava este bloco).
  // Chave ausente na resposta = ilegivel para o token (ponto cego), nunca
  // divergencia: so acusa quando a API devolveu o campo com outro valor.
  const blSec = baseline.security_and_analysis ?? {};
  const secCegos = [];
  for (const [chave, valorEsperado] of Object.entries(blSec)) {
    if (chave.startsWith('_')) continue; // skip JSON comment fields
    const no = repo?.security_and_analysis?.[chave];
    if (no === undefined || no === null) {
      secCegos.push(`security_and_analysis.${chave}`);
      continue;
    }
    const encontrado = no?.status ?? null;
    if (encontrado !== valorEsperado) {
      divergencias.push({ campo: `security_and_analysis.${chave}`, esperado: valorEsperado, encontrado, restauravel: false });
    }
  }
  if (ausentes.length === Object.keys(baseline.merge).length) {
    throw new NaoVerificavel(`/repos+graphql (merge.*)`, 200, 'nem REST nem GraphQL expuseram os campos de merge: o token nao tem permissao para le-los');
  }
  const cegos = [...ausentes.map((a) => `merge.${a}`), ...secCegos];
  if (cegos.length > 0) {
    return { divergencias, cego: `200 — campos nao expostos ao token (REST nem GraphQL): ${ausentes.join(', ')}${secCegos.length ? `; security: ${secCegos.join(', ')}` : ''}`, campos: cegos };
  }
  return divergencias;
}

async function checarActions() {
  const perms = await ghAdmin('GET', `/repos/${OWNER}/${REPO_NAME}/actions/permissions`);
  const divergencias = [];
  for (const [campo, esperado] of Object.entries(baseline.actions)) {
    const encontrado = perms?.[campo] ?? null;
    if (encontrado !== esperado) {
      divergencias.push({ campo: `actions.${campo}`, esperado, encontrado, restauravel: false });
    }
  }
  return divergencias;
}

async function checarWorkflowPermissions() {
  const perms = await ghAdmin('GET', `/repos/${OWNER}/${REPO_NAME}/actions/permissions/workflow`);
  const divergencias = [];
  const bl = baseline.workflow_permissions ?? {};
  for (const [campo, esperado] of Object.entries(bl)) {
    if (campo.startsWith('_')) continue; // skip JSON comment fields
    const encontrado = perms?.[campo] ?? null;
    if (encontrado !== esperado) {
      divergencias.push({ campo: `workflow_permissions.${campo}`, esperado, encontrado, restauravel: false });
    }
  }
  return divergencias;
}

async function checarSelectedActions() {
    // GA75: o endpoint correto e `/actions/permissions/selected-actions` — o
  // caminho curto `/actions/selected-actions` devolve 404 (ponto cego eterno).
  const sel = await ghAdmin('GET', `/repos/${OWNER}/${REPO_NAME}/actions/permissions/selected-actions`);
  const divergencias = [];
  // GA75: o GitHub normaliza `owner/repo` para `owner/repo@*` na leitura; o
  // sufixo `@*` e ignorado nos dois lados antes de comparar.
  const normalizar = (p) => String(p).replace(/@\*$/, '');
  const blPatterns = [...(baseline.selected_actions_patterns ?? [])].map(normalizar).sort(porCodigo);
  const encontradosPatterns = [...(sel?.patterns_allowed ?? [])].map(normalizar).sort(porCodigo);
  if (blPatterns.join('|') !== encontradosPatterns.join('|')) {
    divergencias.push({
      campo: 'selected_actions.patterns_allowed',
      esperado: blPatterns.join(', '),
      encontrado: encontradosPatterns.join(', ') || '(nenhum)',
      restauravel: false,
    });
  }
  return divergencias;
}

// GA79: retencao de artifacts e logs 90 → 14 dias (o W47 nao pegou ou regrediu).
// Endpoint de repo; parse tolerante a variacoes de formato da API.
async function checarRetencao() {
  const dados = await ghAdmin('GET', `/repos/${OWNER}/${REPO_NAME}/actions/permissions/artifact-and-log-retention`);
  const esperado = baseline.artifact_and_log_retention_days ?? 14;
  const encontrado =
    dados?.retention_days ??
    dados?.retention_period_in_days ??
    dados?.artifacts?.retention_days ??
    dados?.artifacts?.retention_period_in_days ??
    dados?.data?.artifacts?.retention_days ??
    dados?.data?.artifacts?.retention_period_in_days ??
    dados?.data?.retention_days ??
    null;
  if (encontrado !== esperado) {
    return [{ campo: 'artifact_and_log_retention_days', esperado, encontrado, restauravel: false }];
  }
  return [];
}

async function checarRulesets() {
  const rulesets = await ghAdmin('GET', `/repos/${OWNER}/${REPO_NAME}/rulesets`);
  const divergencias = [];
  const esperado = baseline.rulesets_count ?? 0;
  const encontrado = (rulesets ?? []).length;
  if (encontrado !== esperado) {
    divergencias.push({ campo: 'rulesets.count', esperado, encontrado, restauravel: false });
  }
  return divergencias;
}

async function checarEnvironments() {
  const dados = await ghAdmin('GET', `/repos/${OWNER}/${REPO_NAME}/environments`);
  const encontrados = (dados?.environments ?? []).map((e) => e.name).sort();
  const esperados = [...baseline.environments].sort();
  const prefixosVercel = (baseline.environments_vercel_managed?.prefixos ?? []);
  const faltando = esperados.filter((e) => !encontrados.includes(e));
  // W13: environments extras — podem ser gerenciados pela Vercel ou inesperados.
  const extras = encontrados.filter((e) => !esperados.includes(e));
  const extrasVercel = extras.filter((e) => prefixosVercel.some((p) => e.startsWith(p)));
  const extrasInesperados = extras.filter((e) => !extrasVercel.includes(e));

  const divergencias = [];
  if (faltando.length > 0) {
    divergencias.push({
      campo: 'environments.faltando',
      esperado: faltando.join(', '),
      encontrado: '(ausente)',
      restauravel: false,
    });
  }
  if (extrasVercel.length > 0) {
    // Aviso não bloqueante: Vercel cria/apaga automaticamente, não é regressão do perímetro.
    // Emite annotation do Actions e também avisa no stderr.
    console.error(`::warning::W13: environments gerenciados pela Vercel presentes (não é regressão): ${extrasVercel.join(', ')}`);
  }
  if (extrasInesperados.length > 0) {
    divergencias.push({
      campo: 'environments.extras_inesperados',
      esperado: '(nenhum além dos do baseline)',
      encontrado: extrasInesperados.join(', '),
      restauravel: false,
    });
  }
  return divergencias;
}

// GA77: sem bloco de restauracao — o guard relata, nao aplica PATCH.
// A aplicacao do perimetro vive em `scripts/ci/aplicar-perimetro.mjs` (GA80).

// ---------------------------------------------------------------- issue

async function findIssue() {
  // GA78: delega a rotina unica (encontrarIssue).
  return encontrarIssue(gh, OWNER, REPO_NAME, ISSUE_LABEL, ISSUE_TITLE);
}

/**
 * Assinatura estavel da causa: campos divergentes (com o valor lido) + checagens cegas
 * (nome + conjunto ordenado dos campos nao lidos, quando a cegueira e parcial — sem isso
 * "faltou allow_auto_merge" e "faltou allow_squash_merge" davam a mesma assinatura e a
 * mudanca de ponto cego ficava 7 dias suprimida; achado do Devin/Codex na PR #1920).
 * Nunca entra: prosa de erro, timestamp, numero de run.
 */
export function assinaturaDe(divergencias, naoVerificaveis) {
  const div = [...divergencias].map((d) => `${d.campo}=${String(d.encontrado)}`).sort(porCodigo);
  const cegos = [...naoVerificaveis]
    .map((n) => `${n.nome}:${[...(n.campos ?? [])].sort(porCodigo).join('|')}`)
    .sort(porCodigo);
  return createHash('sha256').update(JSON.stringify({ div, cegos })).digest('hex').slice(0, 16);
}

const MARCADOR = (assinatura) => `<!-- causa:${assinatura} -->`;
const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;


/**
 * W05: dedupe por causa. Comenta de novo so se esta causa ainda nao foi registrada
 * na janela (6 h com divergencia real, 7 dias so com ponto cego). GA77: sem
 * excecao para "restauracao efetiva" — o guard nao restaura mais nada.
 */
async function abrirOuAtualizarIssue(body, { assinatura, janelaMs } = {}) {
  // GA78: rotina unica de issue de alerta — dedupe por marcador + rotacao E51.
  // O marcador da causa ja abre o corpo (MARCADOR(assinatura), primeira linha).
  return abrirOuRotacionar({
    gh,
    owner: OWNER,
    repo: REPO_NAME,
    label: ISSUE_LABEL,
    title: ISSUE_TITLE,
    body,
    marcador: assinatura ? MARCADOR(assinatura) : null,
    janelaMs,
    autor: AUTOR_DO_GUARD,
  });
}

async function fecharIssue() {
  // GA78: delega a rotina unica (fecha como completed: perimetro voltou a OK).
  await fecharSeAberta(gh, OWNER, REPO_NAME, ISSUE_LABEL, ISSUE_TITLE, '✅ Perimetro conferido contra o baseline — fechando automaticamente.');
}

// ---------------------------------------------------------------- principal

async function main() {
  if (!TOKEN) {
    console.error('::error::GITHUB_TOKEN ausente');
    process.exit(1);
  }
  console.log(`Leitura administrativa: ${fonteDaLeituraAdmin()}`);
  const checagens = [
    ['branch protection', checarBranchProtection],
    ['merge/repo', checarRepo],
    ['actions', checarActions],
    ['workflow permissions', checarWorkflowPermissions],
    ['selected actions', checarSelectedActions],
    ['retencao artifacts/logs', checarRetencao],
    ['rulesets', checarRulesets],
    ['environments', checarEnvironments],
  ];

  const divergencias = [];
  const naoVerificaveis = [];

  for (const [nome, fn] of checagens) {
    try {
      const resultado = await fn();
      const encontradas = Array.isArray(resultado) ? resultado : resultado.divergencias;
      if (!Array.isArray(resultado) && resultado.cego) {
        console.log(`::warning::${nome}: PARCIALMENTE VERIFICAVEL — ${semQuebra(resultado.cego)}`);
        naoVerificaveis.push({ nome: `${nome} (parcial)`, motivo: resultado.cego, campos: resultado.campos ?? [] });
      }
      console.log(`${nome}: ${encontradas.length === 0 ? 'OK' : `${encontradas.length} divergencia(s)`}`);
      divergencias.push(...encontradas);
    } catch (e) {
      if (e instanceof NaoVerificavel) {
        // Ponto cego declarado: não é regressão, mas precisa aparecer.
        console.log(`::warning::${nome}: NAO VERIFICAVEL — ${semQuebra(e.message)}`);
        naoVerificaveis.push({ nome, motivo: `${e.status} — ${e.message.split(': ').slice(1).join(': ')}`, campos: [String(e.status)] });
      } else {
        throw e;
      }
    }
  }

  for (const d of divergencias) {
    console.log(`divergencia: ${semQuebra(d.campo)} esperado=${semQuebra(d.esperado)} encontrado=${semQuebra(d.encontrado)}`);
  }

  // W17: salva snapshot do perimetro medido para artifact de diff.
  const snapshotPath = process.env.PERIMETER_SNAPSHOT_PATH;
  if (snapshotPath) {
    const snapshot = {
      medido_em: new Date().toISOString(),
      run_id: process.env.GITHUB_RUN_ID ?? 'manual',
      divergencias,
      nao_verificaveis: naoVerificaveis,
    };
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    console.log(`Snapshot do perimetro salvo em ${snapshotPath}`);
  }

  if (divergencias.length === 0 && naoVerificaveis.length === 0) {
    console.log('✅ Perimetro OK — nenhuma regressao detectada.');
    await fecharIssue();
    return;
  }

  // GA77: sem restauracao automatica — divergencia vira alerta, sempre.
  const soCegos = divergencias.length === 0;
  const assinatura = assinaturaDe(divergencias, naoVerificaveis);
  const linhas = [
    MARCADOR(assinatura),
    soCegos ? '## 👁️ Ponto cego do perímetro (nada divergiu do que foi possível ler)' : '## ⚠️ Divergência de perímetro detectada',
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
      'Estes campos **não puderam ser conferidos** — a API exige escopo que o token usado não tem.',
      'Não é "está tudo certo": é "não consegui olhar".',
      '',
      `Leitura administrativa deste run: ${fonteDaLeituraAdmin()}. Credencial e rotação: \`${RUNBOOK_SEGREDOS}\`.`,
      '',
      '| Checagem | Motivo |',
      '|---|---|',
      ...naoVerificaveis.map((n) => `| ${n.nome} | ${n.motivo.replace(/\|/g, '/')} |`),
      '',
    );
  }

  linhas.push(
    `Run: https://github.com/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID ?? 'manual'}`,
    `Timestamp: ${new Date().toISOString()}`,
  );

  await abrirOuAtualizarIssue(linhas.join('\n'), {
    assinatura,
    janelaMs: soCegos ? SETE_DIAS_MS : SEIS_HORAS_MS,
  });

  if (soCegos) {
    // W05: "nao consegui olhar" precisa de gente (a issue existe para isso), mas
    // NAO e regressao — um run vermelho a cada 6 h por falta de escopo ensina a
    // ignorar o vermelho. O job sai verde com aviso; a credencial de leitura
    // administrativa (W11/W12) e o que fecha o ponto cego de verdade.
    console.log(`::warning::Perimetro com ${naoVerificaveis.length} ponto(s) cego(s) e nenhuma divergencia lida. Ver issue [settings-guard].`);
    return;
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('::error::' + e.message);
    process.exit(1);
  });
}
