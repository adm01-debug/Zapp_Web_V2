import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Contratos do settings-guard. O guard é executado de VERDADE (child process) com
// um `fetch` stubbed — um teste que reimplementa a lógica no próprio arquivo
// passa a valer sobre a cópia, não sobre o guard, e foi assim que a versão
// anterior deste arquivo ficou verde enquanto o guard falhava em produção.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'github-settings-guard.mjs');

/**
 * Stub de `fetch` no mesmo formato do baseline real. `modo` escolhe a resposta:
 *   ok            — tudo conforme o baseline (sem bloco de review exigido)
 *   regressao     — strict=false (a regressão que o guard existe para pegar)
 *   semEscopo     — a branch protection responde 403 (o que o GITHUB_TOKEN faz hoje)
 *   injecao       — valores com \n vindos da API (jssecurity:S5145)
 *   aprovacoes    — required_approving_review_count=1 (a regressão do ADR-004)
 *   aprovacoesZero— o bloco de review presente com 0 aprovacoes (estado do baseline)
 */
function stub(modo) {
  const prot = {
    ok: "send({ required_status_checks: { strict: true, contexts: ['🔍 Lint & TypeCheck','🧪 Unit Tests','🏗️ Build','🔒 Security Audit','Contrato DB offline','🎭 E2E Tests (Playwright)'] }, enforce_admins: { enabled: true } })",
    regressao: "send({ required_status_checks: { strict: false, contexts: ['🔍 Lint & TypeCheck','🧪 Unit Tests','🏗️ Build','🔒 Security Audit','Contrato DB offline','🎭 E2E Tests (Playwright)'] }, enforce_admins: { enabled: true } })",
    semEscopo: "send({ message: 'Resource not accessible by integration' }, 403)",
    injecao: "send({ required_status_checks: { strict: 'false\\n::error::forged', contexts: ['ci'] }, enforce_admins: { enabled: true } })",
    // ADR-004: o baseline exige 0 aprovacoes enquanto houver um mantenedor unico.
    // Aqui a API devolve 1 — o que hoje passaria como "Perimetro OK".
    aprovacoes: "send({ required_status_checks: { strict: true, contexts: ['🔍 Lint & TypeCheck','🧪 Unit Tests','🏗️ Build','🔒 Security Audit','Contrato DB offline','🎭 E2E Tests (Playwright)'] }, enforce_admins: { enabled: true }, required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: true, require_code_owner_reviews: false } })",
    aprovacoesZero: "send({ required_status_checks: { strict: true, contexts: ['🔍 Lint & TypeCheck','🧪 Unit Tests','🏗️ Build','🔒 Security Audit','Contrato DB offline','🎭 E2E Tests (Playwright)'] }, enforce_admins: { enabled: true }, required_pull_request_reviews: { required_approving_review_count: 0, dismiss_stale_reviews: true, require_code_owner_reviews: false } })",
  }[modo];

  // S3923: aqui havia `modo === 'injecao' ? A : B` com A e B IDENTICOS -- ramo morto,
  // o valor nao mudava com a condicao. A correcao NAO foi apagar a distincao: foi fazer
  // os ramos diferirem de verdade, que era a intencao. Em injecao o campo repo carrega
  // quebra de linha, o que o guard precisa neutralizar antes de imprimir.
  const repo =
    modo === 'injecao'
      ? "send({ allow_auto_merge: true, allow_squash_merge: 'true\\n::error::forged3', allow_merge_commit: false, allow_rebase_merge: false, delete_branch_on_merge: true, squash_merge_commit_message: 'PR_BODY', squash_merge_commit_title: 'PR_TITLE' })"
      : "send({ allow_auto_merge: true, allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, delete_branch_on_merge: true, squash_merge_commit_message: 'PR_BODY', squash_merge_commit_title: 'PR_TITLE' })"

  const actions = "send({ enabled: true, allowed_actions: 'selected', sha_pinning_required: true })";
  const envs =
    "send({ environments: [{ name: 'copilot' },{ name: 'db-ledger-evidence' },{ name: 'legacy-import-destrutivo' },{ name: 'Preview' },{ name: 'producao-ddl' },{ name: 'producao-edge-functions' },{ name: 'Production' }] })";

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
    "  if (p.indexOf('/issues?labels=') !== -1) return send([]);",
    "  if (p.endsWith('/branches/main/protection')) return " + prot + ';',
    "  if (p.indexOf('/actions/permissions') !== -1) return " + actions + ';',
    "  if (p.indexOf('/environments') !== -1) return " + envs + ';',
    "  if (method === 'GET' && p === '/repos/o/r') return " + repo + ';',
    "  if (method === 'GET') return send({});",
    "  if (method === 'PATCH') return send({});",
    "  if (method === 'POST' && p.indexOf('/issues') !== -1) return send({ number: '999\\n::error::forged2' });",
    '  return send({});',
    '};',
    '',
  ].join('\n');
}

function rodarGuard(modo) {
  const arquivo = 'data:text/javascript,' + encodeURIComponent(stub(modo));
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
    assert.ok(r.out.includes('Restaurado'), `nao tentou restaurar o que sabe restaurar:\n${r.out}`);
  });
});

describe('settings-guard: ponto cego (E95)', () => {
  it('403 na branch protection vira NAO VERIFICAVEL, nao falha silenciosa', () => {
    // O comportamento antigo: o erro subia, o guard morria no primeiro GET e
    // NUNCA abria a issue — 6 runs, 6 falhas silenciosas (medido em 03/10/2026).
    const r = rodarGuard('semEscopo');
    assert.equal(r.code, 1, 'deve sair != 0: "nao consegui olhar" precisa de atencao');
    assert.ok(
      r.out.includes('NAO VERIFICAVEL'),
      `o ponto cego nao foi declarado — sem isto ele passa por "tudo certo":\n${r.out}`,
    );
    assert.ok(
      r.out.includes('403'),
      `o motivo (403 sem escopo) precisa aparecer no log:\n${r.out}`,
    );
    assert.ok(
      !r.out.includes('Perimetro OK'),
      `nao pode declarar OK o que nao conseguiu ler:\n${r.out}`,
    );
  });

  it('abre a issue tambem quando o problema e falta de escopo', () => {
    const r = rodarGuard('semEscopo');
    assert.ok(
      r.linhas.some((l) => l.startsWith('Issue #')),
      `nenhuma issue foi aberta — era exatamente o defeito antigo:\n${r.out}`,
    );
  });
});

// ADR-004: enquanto houver um unico mantenedor, a main fica com
// required_approving_review_count = 0 e o rigor vem dos checks obrigatorios (o
// GitHub nao deixa o autor aprovar o proprio PR). O baseline declara esse campo
// desde 03/10/2026, mas NADA o conferia: subir para 1 — a mao ou por PUT completo
// de branch protection, que ja derrubou `strict` tres vezes — passava como
// "Perimetro OK". O guard passa a acusar a divergencia; e NAO restaura sozinho,
// porque mexer em politica de aprovacao e' decisao humana, nao rotina.
describe('settings-guard: aprovacoes exigidas na main (ADR-004)', () => {
  it('required_approving_review_count=1 e divergencia, com a politica citada', () => {
    const r = rodarGuard('aprovacoes');
    assert.equal(r.code, 1, `esperava exit 1, veio ${r.code}:\n${r.out}`);
    assert.ok(
      r.out.includes('branch_protection_main.required_approving_review_count'),
      `nao apontou o campo de aprovacoes:\n${r.out}`,
    );
    assert.ok(
      r.out.includes('ADR-004'),
      `a divergencia precisa apontar a decisao que a explica:\n${r.out}`,
    );
  });

  it('bloco de review presente com 0 aprovacoes nao e divergencia', () => {
    const r = rodarGuard('aprovacoesZero');
    assert.equal(r.code, 0, `o estado do baseline foi acusado como regressao:\n${r.out}`);
    assert.ok(r.out.includes('Perimetro OK'), `nao confirmou o OK:\n${r.out}`);
  });

  it('nao muda politica de aprovacao sozinho: alerta e issue, sem restauracao', () => {
    const r = rodarGuard('aprovacoes');
    assert.ok(
      !r.out.includes('Restaurado: branch_protection_main.required_approving_review_count'),
      `o guard mexeu em politica de aprovacao sem decisao humana:\n${r.out}`,
    );
    assert.ok(
      r.linhas.some((l) => l.startsWith('Issue #')),
      `nenhuma issue aberta para a divergencia de aprovacoes:\n${r.out}`,
    );
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
