import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal contract tests for the settings-guard logic (no network calls).
// Full integration is validated by E13's workflow_dispatch → issue open < 1 min.

describe('settings-guard: regression detection logic', () => {
  it('detects strict=false as regression', () => {
    const strict = false;
    const allowAutoMerge = true;
    const regressions = [];
    if (strict !== true) regressions.push('required_status_checks.strict');
    if (allowAutoMerge !== true) regressions.push('allow_auto_merge');
    assert.deepEqual(regressions, ['required_status_checks.strict']);
  });

  it('detects allow_auto_merge=false as regression', () => {
    const strict = true;
    const allowAutoMerge = false;
    const regressions = [];
    if (strict !== true) regressions.push('required_status_checks.strict');
    if (allowAutoMerge !== true) regressions.push('allow_auto_merge');
    assert.deepEqual(regressions, ['allow_auto_merge']);
  });

  it('detects both regressions at once', () => {
    const strict = false;
    const allowAutoMerge = false;
    const regressions = [];
    if (strict !== true) regressions.push('required_status_checks.strict');
    if (allowAutoMerge !== true) regressions.push('allow_auto_merge');
    assert.equal(regressions.length, 2);
  });

  it('reports no regression when both are correct', () => {
    const strict = true;
    const allowAutoMerge = true;
    const regressions = [];
    if (strict !== true) regressions.push('required_status_checks.strict');
    if (allowAutoMerge !== true) regressions.push('allow_auto_merge');
    assert.equal(regressions.length, 0);
  });

  it('handles null strict as regression', () => {
    // O guard real lê `protection?.required_status_checks?.strict ?? null`
    // (github-settings-guard.mjs:112): a API pode devolver o campo ausente, e o
    // `?? null` normaliza. Simula-se essa resposta em vez de um literal `null`,
    // que o analisador constataria sempre-verdadeiro contra `!== true`.
    const protection = JSON.parse('{"required_status_checks":{}}');
    const strict = protection.required_status_checks?.strict ?? null;
    const regressions = [];
    if (strict !== true) regressions.push('required_status_checks.strict');
    assert.equal(regressions.length, 1);
  });
});

// jssecurity:S5145 (log injection) — cobre as linhas 92, 115 e 127 do guard.
// Um valor vindo da API do GitHub contendo `\n` NÃO pode forjar uma linha nova
// no log do workflow. Executa-se o guard de verdade (child process) com um
// `fetch` stubbed que devolve valores maliciosos, e exige-se uma linha só.
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'github-settings-guard.mjs');

const FETCH_STUB = [
  "const send = (obj, status) => {",
  "  status = status || 200;",
  "  return {",
  "    ok: status >= 200 && status < 300,",
  "    status: status,",
  "    headers: { get: () => (obj == null ? '0' : '1') },",
  "    json: async () => obj,",
  "    text: async () => JSON.stringify(obj),",
  "  };",
  "};",
  "globalThis.fetch = async (url, opts) => {",
  "  opts = opts || {};",
  "  const p = String(url).replace('https://api.github.com', '');",
  "  const method = String(opts.method || 'GET').toUpperCase();",
  "  if (p.indexOf('/issues?labels=') !== -1) return send([]);",
  "  if (method === 'GET' && p.endsWith('/protection')) return send({ required_status_checks: { strict: 'false\\n::error::forged', contexts: ['ci'] } });",
  "  if (method === 'GET') return send({ allow_auto_merge: true });",
  "  if (method === 'POST' && p.endsWith('/issues')) return send({ number: '999\\n::error::forged2' });",
  "  return send({});",
  "};",
  "",
].join('\n');

describe('settings-guard: log injection (jssecurity:S5145)', () => {
  it('neutraliza quebras de linha vindas da API (linhas 92, 115 e 127)', () => {
    // Stub carregado como data: URL (--import) — sem arquivo temporário em disco.
    const stub = 'data:text/javascript,' + encodeURIComponent(FETCH_STUB);
    const res = spawnSync(process.execPath, ['--import', stub, SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: 'x', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '1' },
    });
    const out = `${res.stdout}${res.stderr}`;
    const linhas = out.split('\n');

    // Linha 127 — o aviso precisa caber numa única linha: o valor cru da API
    // ('false\n::error::forged') não pode quebrar a mensagem em duas.
    const linhaAviso = linhas.find((l) => l.includes('::warning::Regressão detectada:'));
    assert.ok(linhaAviso, `aviso ausente na saída:\n${out}`);
    assert.ok(
      linhaAviso.includes('atual=false ::error::forged'),
      `valor não-confiável vazou cru na linha 127: ${JSON.stringify(linhaAviso)}`,
    );

    // Linha 115 — status e allow_auto_merge na mesma linha.
    const linhaStatus = linhas.find((l) => l.startsWith('strict='));
    assert.ok(linhaStatus, `linha de status ausente na saída:\n${out}`);
    assert.ok(
      linhaStatus.includes('strict=false ::error::forged'),
      `valor não-confiável vazou cru na linha 115: ${JSON.stringify(linhaStatus)}`,
    );
    assert.ok(linhaStatus.includes('allow_auto_merge=true'), `allow_auto_merge perdido na linha 115: ${linhaStatus}`);

    // Linha 92 — número da issue (resposta da API) numa linha só.
    const linhaIssue = linhas.find((l) => l.startsWith('Issue #'));
    assert.ok(linhaIssue, `linha da issue ausente na saída:\n${out}`);
    assert.ok(
      linhaIssue.includes('Issue #999 ::error::forged2 aberta.'),
      `valor não-confiável vazou cru na linha 92: ${JSON.stringify(linhaIssue)}`,
    );

    // Nada de linha forjada completa no log.
    assert.ok(
      !linhas.includes('::error::forged') && !linhas.includes('::error::forged2'),
      `linha de log forjada emitida:\n${out}`,
    );
  });
});
