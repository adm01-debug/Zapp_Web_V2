import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assinaturaDe } from './github-settings-guard.mjs';

// Contratos do settings-guard. O guard é executado de VERDADE (child process) com
// um `fetch` stubbed — um teste que reimplementa a lógica no próprio arquivo
// passa a valer sobre a cópia, não sobre o guard, e foi assim que a versão
// anterior deste arquivo ficou verde enquanto o guard falhava em produção.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'github-settings-guard.mjs');
const TITULO = '[settings-guard] perimeter regression detected';

const CONTEXTS_OK =
  "['🔎 TypeCheck','🧪 Unit Tests (1/3)','🧪 Unit Tests (2/3)','🧪 Unit Tests (3/3)','🏗️ Build','🧩 Node CI Scripts']";
const PROT_OK = `send({ required_status_checks: { strict: true, contexts: ${CONTEXTS_OK} }, enforce_admins: { enabled: true }, required_linear_history: { enabled: true }, allow_force_pushes: { enabled: false } })`;
const PROT_REGRESSAO = `send({ required_status_checks: { strict: false, contexts: ${CONTEXTS_OK} }, enforce_admins: { enabled: true }, required_linear_history: { enabled: true }, allow_force_pushes: { enabled: false } })`;
const REPO_OK =
  "send({ allow_auto_merge: true, allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, delete_branch_on_merge: true, squash_merge_commit_message: 'PR_BODY', squash_merge_commit_title: 'PR_TITLE', security_and_analysis: { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } } })";
const ACTIONS_OK = "send({ enabled: true, allowed_actions: 'selected', sha_pinning_required: true })";
const WORKFLOW_PERMS_OK = "send({ default_workflow_permissions: 'read', can_approve_pull_request_reviews: true })";
// GA75: sem `step-security/harden-runner` (removido do baseline e do
// allowed-actions: passava no check de pins e morreria com startup_failure).
const SELECTED_PATTERNS = "['oven-sh/setup-bun','denoland/setup-deno','supabase/setup-cli','peter-evans/create-pull-request','gitleaks/gitleaks-action','actions/cache','actions/cache/restore','actions/cache/save','actions/checkout','actions/github-script','actions/setup-go','actions/setup-node','actions/upload-artifact','github/codeql-action','actions/dependency-review-action','ossf/scorecard-action']";
const SELECTED_OK = `send({ patterns_allowed: ${SELECTED_PATTERNS} })`;
const SEM_ESCOPO = "send({ message: 'Resource not accessible by integration' }, 403)";

/**
 * Stub de `fetch` no mesmo formato do baseline real. `modo` escolhe a resposta:
 *   ok         — tudo conforme o baseline
 *   regressao  — strict=false (a regressão que o guard existe para pegar)
 *   semChecks  — `required_status_checks: null` (os 6 checks obrigatorios apagados;
 *                e assim que a API DESLIGA os checks — achado do Codex na PR #1920)
 *   semEscopo  — a branch protection responde 403
 *   tokenReal  — o que o GITHUB_TOKEN devolve HOJE (medido no run 38615982485):
 *                403 em branch protection e actions, e `GET /repos` 200 SEM os
 *                campos de merge (o defeito W04: isso virava "7 divergencias")
 *   parcial    — `GET /repos` 200 com PARTE dos campos de merge (cegueira parcial)
 *   injecao    — valores com \n vindos da API (jssecurity:S5145)
 * Opcoes:
 *   issue          — simula a issue [settings-guard] ja aberta
 *   ultimoMarcador — marcador do ultimo comentario da issue (W05: dedupe por causa)
 *   idadeMs        — idade desse comentario
 *   comentarioDepois — um comentario alheio (humano/outro bot) DEPOIS do marcador
 *   autorMarcador  — quem escreveu o comentario com o marcador (default: o proprio guard)
 *   patchStatus    — status HTTP devolvido a qualquer PATCH (403 = restauracao falha)
 */
const GUARD = 'github-actions[bot]';
function stub(
  modo,
  {
    issue = false,
    ultimoMarcador = '',
    idadeMs = 0,
    comentarioDepois = false,
    autorMarcador = GUARD,
    // GA79: dias de retencao devolvidos pelo stub (default = baseline = 14).
    retencaoDias = 14,
    // GA76: sobrescrevem o corpo de /graphql e de GET /repos (modo gqlCompleta).
    gqlSus = null,
    repoSus = null,
    // GA75: sobrescreve o corpo de selected-actions (sufixo @* / pattern extra).
    selectedSus = null,
  } = {},
) {
  const prot =
    {
      ok: PROT_OK,
      regressao: PROT_REGRESSAO,
      semChecks: `send({ required_status_checks: null, enforce_admins: { enabled: true }, required_linear_history: { enabled: true }, allow_force_pushes: { enabled: false } })`,
      semEscopo: SEM_ESCOPO,
      tokenReal: SEM_ESCOPO,
      parcial: PROT_OK,
      injecao: "send({ required_status_checks: { strict: 'false\\n::error::forged', contexts: ['ci'] }, enforce_admins: { enabled: true }, required_linear_history: { enabled: true }, allow_force_pushes: { enabled: false } })",
    }[modo] ?? PROT_OK;
  const workflowPerms = modo === 'tokenReal' ? SEM_ESCOPO : WORKFLOW_PERMS_OK;

  // S3923: aqui havia `modo === 'injecao' ? A : B` com A e B IDENTICOS -- ramo morto,
  // o valor nao mudava com a condicao. A correcao NAO foi apagar a distincao: foi fazer
  // os ramos diferirem de verdade, que era a intencao. Em injecao o campo repo carrega
  // quebra de linha, o que o guard precisa neutralizar antes de imprimir.
  const repo = {
    injecao:
      "send({ allow_auto_merge: true, allow_squash_merge: 'true\\n::error::forged3', allow_merge_commit: false, allow_rebase_merge: false, delete_branch_on_merge: true, squash_merge_commit_message: 'PR_BODY', squash_merge_commit_title: 'PR_TITLE' })",
    // O GET /repos real com GITHUB_TOKEN: 200, metadados publicos, NENHUM campo de merge.
    tokenReal: "send({ id: 1, name: 'r', full_name: 'o/r', private: false, default_branch: 'main' })",
    // Cegueira parcial: dois campos vieram, os outros cinco nao.
    parcial: "send({ id: 1, allow_auto_merge: true, delete_branch_on_merge: true })",
    // GA76: REST so com os 2 campos REST-only; o GraphQL completa o resto.
    gqlCompleta: "send({ id: 1, squash_merge_commit_message: 'PR_BODY', squash_merge_commit_title: 'PR_TITLE', security_and_analysis: { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } } })",
  }[modo] ?? REPO_OK;
  const repoEfetivo = repoSus ?? repo;

  const actions = modo === 'tokenReal' ? SEM_ESCOPO : ACTIONS_OK;
  // GA79: retencao de artifacts/logs; tokenReal/semEscopo devolvem 403.
  const retencao =
    modo === 'tokenReal' || modo === 'semEscopo' ? SEM_ESCOPO : `send({ retention_days: ${Number(retencaoDias)} })`;
  // GA76: GraphQL de merge.*; tokenReal/semEscopo recusam (403), parcial expoe
  // so 2 campos, gqlErro devolve `errors` (fallback para o REST).
  const GQL_OK =
    'send({ data: { repository: { autoMergeAllowed: true, squashMergeAllowed: true, mergeCommitAllowed: false, rebaseMergeAllowed: false, deleteBranchOnMerge: true } } })';
  const GQL_PARCIAL = 'send({ data: { repository: { autoMergeAllowed: true, deleteBranchOnMerge: true } } })';
  const gql =
    gqlSus ??
    {
      ok: GQL_OK,
      regressao: GQL_OK,
      semChecks: GQL_OK,
      semEscopo: SEM_ESCOPO,
      tokenReal: SEM_ESCOPO,
      parcial: GQL_PARCIAL,
      gqlCompleta: GQL_OK,
      gqlErro: "send({ errors: [{ message: 'boom' }] })",
      injecao: GQL_OK,
    }[modo];
  const envs =
    "send({ environments: [{ name: 'banco-leitura' },{ name: 'db-ledger-evidence' },{ name: 'legacy-import-destrutivo' },{ name: 'perimetro-leitura' },{ name: 'producao-ddl' },{ name: 'producao-edge-functions' }] })";

  const criadoEm = new Date(Date.now() - idadeMs).toISOString();
  const totalComentarios = comentarioDepois ? 2 : 1;
  const issues = issue
    ? `send([{ number: 42, title: ${JSON.stringify(TITULO)}, comments: ${totalComentarios}, created_at: '2026-10-01T00:00:00Z', body: '', user: { login: '${GUARD}' } }])`
    : 'send([])';
  const listaComentarios = [
    `{ body: ${JSON.stringify(`${ultimoMarcador}\n(comentario com marcador)`)}, created_at: '${criadoEm}', user: { login: ${JSON.stringify(autorMarcador)} } }`,
  ];
  if (comentarioDepois) {
    listaComentarios.push(
      `{ body: 'comentario humano sem marcador, posterior ao do guard', created_at: '${new Date().toISOString()}', user: { login: 'humano' } }`,
    );
  }
  const comentarios = `send([${listaComentarios.join(', ')}])`;

  return [
    'const send = (obj, status) => {',
    '  status = status || 200;',
    '  return {',
    '    ok: status >= 200 && status < 300,',
    '    status: status,',
    "    headers: { get: () => (obj == null ? '0' : '1') },",
    '    json: async () => obj,',
    '    text: async () => JSON.stringify(obj),',
    '  };',
    '};',
    'globalThis.fetch = async (url, opts) => {',
    '  opts = opts || {};',
    "  const p = String(url).replace('https://api.github.com', '');",
    "  const method = String(opts.method || 'GET').toUpperCase();",
    "  if (p.indexOf('/issues?labels=') !== -1) return " + issues + ';',
    "  if (method === 'GET' && p.indexOf('/issues/42/comments') !== -1) return " + comentarios + ';',
    "  if (p.endsWith('/branches/main/protection')) return " + prot + ';',
    "  if (p.endsWith('/actions/permissions/artifact-and-log-retention')) return " + retencao + ';',
    "  if (p.endsWith('/actions/permissions/selected-actions')) return " + (selectedSus ?? SELECTED_OK) + ';',
    "  if (p.endsWith('/actions/permissions/workflow')) return " + workflowPerms + ';',
    "  if (p.indexOf('/actions/permissions') !== -1) return " + actions + ';',
    "  if (p === '/graphql') return " + gql + ';',
    "  if (method === 'GET' && p.endsWith('/rulesets')) return send([]);",
    "  if (p.indexOf('/environments') !== -1) return " + envs + ';',
    "  if (method === 'GET' && p === '/repos/o/r') return " + repoEfetivo + ';',
    "  if (method === 'GET') return send({});"
    + "  if (method === 'PATCH') return send({ message: 'nao deveria acontecer (GA77: sem PATCH)' }, 200);",
    "  if (method === 'POST' && p.indexOf('/comments') !== -1) return send({ id: 7 });",
    "  if (method === 'POST' && p.indexOf('/issues') !== -1) return send({ number: '999\\n::error::forged2' });",
    '  return send({});',
    '};',
    '',
  ].join('\n');
}

function rodarGuard(modo, opts) {
  const arquivo = 'data:text/javascript,' + encodeURIComponent(stub(modo, opts));
  const res = spawnSync(process.execPath, ['--import', arquivo, SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_TOKEN: 'x', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '1' },
  });
  return {
    code: res.status,
    out: `${res.stdout}${res.stderr}`,
    linhas: `${res.stdout}${res.stderr}`.split('\n'),
  };
}

// Assinatura do caso `tokenReal`: nenhuma divergencia lida, tres checagens cegas.
// `campos` repete o que o guard registra: o status HTTP quando a checagem inteira
// lancou NaoVerificavel (403 nas duas administrativas; 200 no /repos sem campos).
const CEGOS_TOKEN_REAL = [
  { nome: 'branch protection', campos: ['403'] },
  { nome: 'merge/repo', campos: ['200'] },
  { nome: 'actions', campos: ['403'] },
  { nome: 'workflow permissions', campos: ['403'] },
  // GA79: a retencao tambem e ilegivel com GITHUB_TOKEN (403).
  { nome: 'retencao artifacts/logs', campos: ['403'] },
];
const MARCADOR_TOKEN_REAL = `<!-- causa:${assinaturaDe([], CEGOS_TOKEN_REAL)} -->`;
// Assinatura do caso `regressao`: strict=false lido, nada cego.
const MARCADOR_REGRESSAO = `<!-- causa:${assinaturaDe([{ campo: 'branch_protection_main.strict', encontrado: false }], [])} -->`;

describe('settings-guard: perimetro conforme o baseline', () => {
  it('perimetro OK: nao acusa divergencia e sai 0', () => {
    const r = rodarGuard('ok');
    assert.equal(r.code, 0, `esperava exit 0, veio ${r.code}:\n${r.out}`);
    assert.ok(r.out.includes('Perimetro OK'), `nao confirmou o OK:\n${r.out}`);
    assert.ok(!r.out.includes('::warning::'), `avisou sem motivo:\n${r.out}`);
  });

  it('strict=false e detectado como divergencia (a regressao que o guard existe para pegar)', () => {
    const r = rodarGuard('regressao');
    assert.equal(r.code, 1, `esperava exit 1, veio ${r.code}:\n${r.out}`);
    assert.ok(
      r.out.includes('branch_protection_main.strict'),
      `nao apontou o campo divergente:\n${r.out}`,
    );
    // GA77: o guard NAO restaura mais — so alerta (aplicar e GA80, com aprovacao).
    assert.ok(!r.out.includes('Restaurado'), `GA77: o guard aplicou PATCH sozinho:\n${r.out}`);
    assert.ok(r.out.includes('Issue #'), `divergencia sem issue de alerta:\n${r.out}`);
  });

  it('required_status_checks: null e regressao (checks apagados), nunca ponto cego', () => {
    // A API usa `null` para DESLIGAR os checks obrigatorios. Tratar isso como
    // "campo nao lido" deixaria passar a pior regressao possivel: zero checks na main.
    const r = rodarGuard('semChecks');
    assert.equal(r.code, 1, `esperava exit 1, veio ${r.code}:\n${r.out}`);
    assert.ok(r.out.includes('required_status_checks desligado'), `nao nomeou a causa:\n${r.out}`);
    assert.ok(r.out.includes('branch_protection_main.required_status_checks'), `nao acusou os contexts ausentes:\n${r.out}`);
    assert.ok(!r.out.includes('NAO VERIFICAVEL'), `tratou checks apagados como ponto cego:\n${r.out}`);
    // GA77: sem PATCH em nenhuma circunstancia.
    assert.ok(!r.out.includes('Restaurado'), `tentou restaurar sem o bloco de checks:\n${r.out}`);
  });
});

describe('settings-guard: ponto cego (E95, W04, W05)', () => {
  it('403 na branch protection vira NAO VERIFICAVEL, nao falha silenciosa', () => {
    // O comportamento antigo: o erro subia, o guard morria no primeiro GET e
    // NUNCA abria a issue — 6 runs, 6 falhas silenciosas (medido em 03/10/2026).
    const r = rodarGuard('semEscopo');
    assert.ok(
      r.out.includes('NAO VERIFICAVEL'),
      `o ponto cego nao foi declarado — sem isto ele passa por "tudo certo":\n${r.out}`,
    );
    assert.ok(r.out.includes('403'), `o motivo (403 sem escopo) precisa aparecer no log:\n${r.out}`);
    assert.ok(!r.out.includes('Perimetro OK'), `nao pode declarar OK o que nao conseguiu ler:\n${r.out}`);
  });

  it('abre a issue tambem quando o problema e falta de escopo', () => {
    const r = rodarGuard('semEscopo');
    assert.ok(
      r.linhas.some((l) => l.startsWith('Issue #')),
      `nenhuma issue foi aberta — era exatamente o defeito antigo:\n${r.out}`,
    );
  });

  it('W05: so ponto cego (nada divergiu do que foi lido) sai 0 com ::warning::', () => {
    // 30 de 30 runs vermelhos em 7 dias por falta de escopo (14/10/2026) ensinam a
    // ignorar o vermelho. "Nao consegui olhar" vai para a issue; o job fica verde.
    const r = rodarGuard('semEscopo');
    assert.equal(r.code, 0, `esperava exit 0 (so ponto cego), veio ${r.code}:\n${r.out}`);
    assert.ok(r.out.includes('::warning::'), `faltou o aviso de ponto cego:\n${r.out}`);
  });

  it('W04: GET /repos sem os campos de merge e ponto cego, nao "7 divergencias"', () => {
    // Medido no run 38615982485: `merge.allow_auto_merge esperado=true encontrado=null`
    // x7. O token nao le esses campos; o guard acusava divergencia e tentava um
    // PATCH que respondia 403.
    const r = rodarGuard('tokenReal');
    assert.equal(r.code, 0, `esperava exit 0, veio ${r.code}:\n${r.out}`);
    assert.ok(!r.out.includes('divergencia:'), `acusou divergencia em campo nao lido:\n${r.out}`);
    assert.ok(!r.out.includes('encontrado=null'), `null virou divergencia:\n${r.out}`);
    assert.ok(r.out.includes('merge/repo: NAO VERIFICAVEL'), `merge/repo nao foi declarado cego:\n${r.out}`);
    assert.ok(!r.out.includes('Restaurado'), `GA77: tentou restaurar o que nao conseguiu ler:\n${r.out}`);
    assert.ok(r.linhas.some((l) => l.startsWith('Issue #')), `a issue de ponto cego precisa existir:\n${r.out}`);
  });

  it('W04: GET /repos com PARTE dos campos e parcialmente verificavel; o que veio e conferido', () => {
    const r = rodarGuard('parcial');
    assert.equal(r.code, 0, `esperava exit 0, veio ${r.code}:\n${r.out}`);
    assert.ok(r.out.includes('merge/repo: PARCIALMENTE VERIFICAVEL'), `cegueira parcial nao declarada:\n${r.out}`);
    assert.ok(r.out.includes('allow_squash_merge'), `nao listou qual campo faltou:\n${r.out}`);
    assert.ok(!r.out.includes('divergencia:'), `campo ausente virou divergencia:\n${r.out}`);
  });

  it('W05: issue aberta com a MESMA causa ha menos de 7 dias nao recebe comentario novo', () => {
    const r = rodarGuard('tokenReal', { issue: true, ultimoMarcador: MARCADOR_TOKEN_REAL, idadeMs: 60_000 });
    assert.equal(r.code, 0, r.out);
    assert.ok(r.out.includes('Dedupe'), `deveria suprimir o comentario repetido:\n${r.out}`);
    assert.ok(!r.out.includes('atualizada com novo comentario'), `comentou de novo a mesma causa:\n${r.out}`);
  });

  it('W05: um comentario alheio DEPOIS do marcador nao zera o dedupe', () => {
    // Um humano (ou outro bot) comentando na issue nao pode fazer o guard voltar a
    // comentar a cada 6 h — e o que acontecia olhando so o ULTIMO comentario (Codex, PR #1920).
    const r = rodarGuard('tokenReal', {
      issue: true,
      ultimoMarcador: MARCADOR_TOKEN_REAL,
      idadeMs: 60_000,
      comentarioDepois: true,
    });
    assert.equal(r.code, 0, r.out);
    assert.ok(r.out.includes('Dedupe'), `comentario alheio zerou o dedupe:\n${r.out}`);
  });

  it('W05: marcador colado por OUTRO autor nao conta para o dedupe (repo publico)', () => {
    // Qualquer pessoa pode copiar `<!-- causa:... -->` para um comentario e, sem checar o
    // autor, silenciar o alerta por 7 dias (Codex, PR #1920). So o guard se auto-deduplica.
    const r = rodarGuard('tokenReal', {
      issue: true,
      ultimoMarcador: MARCADOR_TOKEN_REAL,
      idadeMs: 60_000,
      autorMarcador: 'curioso',
    });
    assert.equal(r.code, 0, r.out);
    assert.ok(!r.out.includes('Dedupe'), `marcador de terceiro silenciou o guard:\n${r.out}`);
    assert.ok(r.out.includes('Issue #42 atualizada com novo comentario'), `o guard nao registrou a causa:\n${r.out}`);
  });

  it('W05: mesma causa com mais de 7 dias volta a comentar (lembrete semanal)', () => {
    const r = rodarGuard('tokenReal', { issue: true, ultimoMarcador: MARCADOR_TOKEN_REAL, idadeMs: 8 * 24 * 3600 * 1000 });
    assert.equal(r.code, 0, r.out);
    assert.ok(r.out.includes('Issue #42 atualizada com novo comentario'), `nao renovou o lembrete:\n${r.out}`);
  });

  it('W05: causa diferente da ultima comenta de novo', () => {
    const r = rodarGuard('tokenReal', { issue: true, ultimoMarcador: '<!-- causa:outra -->', idadeMs: 60_000 });
    assert.ok(r.out.includes('Issue #42 atualizada com novo comentario'), `causa nova sem comentario:\n${r.out}`);
  });

  it('GA77: divergencia real com a MESMA causa ha menos de 6 h nao comenta de novo (sem excecao de restauracao)', () => {
    // Antes, uma "restauracao efetiva" forcava comentario mesmo com dedupe. Sem
    // PATCH automatico, a regra e uma so: mesma causa + janela = suprime.
    const r = rodarGuard('regressao', { issue: true, ultimoMarcador: MARCADOR_REGRESSAO, idadeMs: 60_000 });
    assert.equal(r.code, 1, r.out);
    assert.ok(!r.out.includes('Restaurado'), `GA77: o guard aplicou PATCH sozinho:\n${r.out}`);
    assert.ok(r.out.includes('Dedupe'), `deveria suprimir o comentario repetido:\n${r.out}`);
    assert.ok(!r.out.includes('atualizada com novo comentario'), `comentou de novo a mesma causa:\n${r.out}`);
  });

  it('GA77: divergencia real com causa NOVA comenta (sem PATCH)', () => {
    const r = rodarGuard('regressao', { issue: true, ultimoMarcador: '<!-- causa:outra -->', idadeMs: 60_000 });
    assert.equal(r.code, 1, r.out);
    assert.ok(!r.out.includes('Restaurado'), `GA77: o guard aplicou PATCH sozinho:\n${r.out}`);
    assert.ok(r.out.includes('Issue #42 atualizada com novo comentario'), `causa nova sem comentario:\n${r.out}`);
  });
});

describe('settings-guard: GA75 — endpoint e normalizacao de selected actions', () => {
  it('patterns com sufixo @* sao normalizados (GitHub devolve owner/repo@*)', () => {
    const comArroba = SELECTED_PATTERNS.replace(/','/g, "@*','").replace(/']$/, "@*']");
    const r = rodarGuard('ok', { selectedSus: `send({ patterns_allowed: ${comArroba} })` });
    assert.equal(r.code, 0, `sufixo @* virou divergencia:
${r.out}`);
  });

  it('pattern fora do baseline vira divergencia (nao ponto cego)', () => {
    const r = rodarGuard('ok', { selectedSus: `send({ patterns_allowed: ${SELECTED_PATTERNS.replace(/]$/, ",'evil/action']")} })` });
    assert.equal(r.code, 1, `pattern estranho passou batido:\n${r.out}`);
    assert.ok(r.out.includes('selected_actions.patterns_allowed'), `nao apontou o campo:\n${r.out}`);
  });

  it('harden-runner fora do baseline e das leituras: presente no vivo e divergencia', () => {
    const r = rodarGuard('ok', {
      selectedSus: `send({ patterns_allowed: ${SELECTED_PATTERNS.replace(/]$/, ",'step-security/harden-runner']")} })`,
    });
    assert.equal(r.code, 1, `harden-runner no vivo passou batido:\n${r.out}`);
  });
});

describe('settings-guard: GA76 — merge.* via GraphQL', () => {
  it('GraphQL completa o que o REST omite: REST parcial + GraphQL cheio = OK sem ponto cego', () => {
    // REST so com os 2 campos REST-only + GraphQL com os 5 de merge = tudo legivel.
    const r = rodarGuard('gqlCompleta');
    assert.equal(r.code, 0, `esperava exit 0, veio ${r.code}:\n${r.out}`);
    assert.ok(r.out.includes('merge/repo: OK'), `merge/repo nao ficou OK:\n${r.out}`);
    assert.ok(!r.out.includes('PARCIALMENTE'), `ponto cego declarado a toa:\n${r.out}`);
  });

  it('GraphQL com errors cai para o REST (sem quebrar o run)', () => {
    const r = rodarGuard('gqlErro');
    assert.equal(r.code, 0, `fallback do GraphQL quebrou o run:\n${r.out}`);
    assert.ok(r.out.includes('Perimetro OK'), `perimetro OK nao confirmado:\n${r.out}`);
  });
});

describe('settings-guard: GA79 — retencao de artifacts/logs', () => {
  it('retencao 14: checagem passa e aparece no log', () => {
    const r = rodarGuard('ok');
    assert.equal(r.code, 0, r.out);
    assert.ok(r.out.includes('retencao artifacts/logs: OK'), `checagem de retencao ausente:\n${r.out}`);
  });

  it('retencao 90: divergencia (W47 regrediu)', () => {
    const r = rodarGuard('ok', { retencaoDias: 90 });
    assert.equal(r.code, 1, `retencao 90 passou batida:\n${r.out}`);
    assert.ok(r.out.includes('artifact_and_log_retention_days'), `nao apontou o campo:\n${r.out}`);
  });
});

describe('settings-guard: assinatura da causa', () => {
  it('e estavel e independe da ordem', () => {
    const a = assinaturaDe([{ campo: 'x', encontrado: 1 }, { campo: 'y', encontrado: 2 }], [{ nome: 'b' }, { nome: 'a' }]);
    const b = assinaturaDe([{ campo: 'y', encontrado: 2 }, { campo: 'x', encontrado: 1 }], [{ nome: 'a' }, { nome: 'b' }]);
    assert.equal(a, b);
    assert.notEqual(a, assinaturaDe([{ campo: 'x', encontrado: 3 }], []));
  });

  it('distingue QUAIS campos ficaram cegos, nao so a checagem', () => {
    // "faltou allow_auto_merge" e "faltou allow_squash_merge" davam a mesma assinatura
    // e a mudanca de ponto cego ficava 7 dias suprimida (Devin/Codex, PR #1920).
    const a = assinaturaDe([], [{ nome: 'merge/repo (parcial)', campos: ['allow_auto_merge'] }]);
    const b = assinaturaDe([], [{ nome: 'merge/repo (parcial)', campos: ['allow_squash_merge'] }]);
    assert.notEqual(a, b);
    const c = assinaturaDe([], [{ nome: 'merge/repo (parcial)', campos: ['allow_squash_merge', 'allow_auto_merge'] }]);
    const d = assinaturaDe([], [{ nome: 'merge/repo (parcial)', campos: ['allow_auto_merge', 'allow_squash_merge'] }]);
    assert.equal(c, d, 'a ordem dos campos nao pode mudar a assinatura');
  });
});

// jssecurity:S5145 (log injection) — um valor vindo da API do GitHub contendo
// `\n` NÃO pode forjar uma linha nova no log do workflow.
describe('settings-guard: log injection (jssecurity:S5145)', () => {
  it('neutraliza quebras de linha vindas da API', () => {
    const r = rodarGuard('injecao');

    const linhaDiv = r.linhas.find((l) => l.includes('divergencia:'));
    assert.ok(linhaDiv, `linha de divergencia ausente:\n${r.out}`);
    assert.ok(
      linhaDiv.includes('::error::forged'),
      `o valor nao chegou (stub quebrado?) ou foi apagado: ${JSON.stringify(linhaDiv)}`,
    );

    const linhaIssue = r.linhas.find((l) => l.startsWith('Issue #'));
    assert.ok(linhaIssue, `linha da issue ausente:\n${r.out}`);
    assert.ok(
      linhaIssue.includes('Issue #999 ::error::forged2 aberta.'),
      `valor nao-confiavel vazou cru: ${JSON.stringify(linhaIssue)}`,
    );

    assert.ok(
      !r.linhas.includes('::error::forged') && !r.linhas.includes('::error::forged2'),
      `linha de log forjada emitida:\n${r.out}`,
    );
  });
});

// W13: environments extras (Vercel-managed vs inesperados)
function rodarComEnvsExtra(extras) {
  // Parte dos environments do baseline REAL + os extras recebidos (a lista
  // hardcoded anterior ficou stale no E94: copilot/Preview/Production saidos,
  // banco-leitura/perimetro-leitura entrados — e o teste quebrava no `faltando`).
  const baselineReal = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'github-settings-baseline.json'), 'utf8'));
  const todos = [...baselineReal.environments, ...extras];
  const envsStub =
    'send({ environments: [' +
    todos.map((n) => `{ name: ${JSON.stringify(n)} }`).join(',') +
    '] })';
  const stb = stub('ok').replace(
    /if \(p\.indexOf\('\/environments'\).*?return .*?;/,
    `if (p.indexOf('/environments') !== -1) return ${envsStub};`,
  );
  const arq = 'data:text/javascript,' + encodeURIComponent(stb);
  const res = spawnSync(process.execPath, ['--import', arq, SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_TOKEN: 'x', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '1' },
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

describe('settings-guard: W13 — environments extras', () => {
  it('extras Vercel-managed (Preview –/Production –) emitem ::warning::, nao divergencia', () => {
    const r = rodarComEnvsExtra(['Preview – zapp_web_v2', 'Production – zapp_web_v2']);
    assert.equal(r.code, 0, `esperava exit 0 (vercel-managed nao e regressao):\n${r.out}`);
    assert.ok(r.out.includes('::warning::'), `warning W13 nao emitido:\n${r.out}`);
    assert.ok(!r.out.includes('extras_inesperados'), `classific. incorreta como inesperado:\n${r.out}`);
  });

  it('extras inesperados (nao-Vercel) sao reportados como divergencia', () => {
    const r = rodarComEnvsExtra(['meu-ambiente-desconhecido']);
    assert.equal(r.code, 1, `esperava exit 1 (extra inesperado e regressao):\n${r.out}`);
    assert.ok(r.out.includes('extras_inesperados'), `divergencia nao apontada:\n${r.out}`);
    assert.ok(r.out.includes('meu-ambiente-desconhecido'), `nome do ambiente ausente:\n${r.out}`);
  });
});
