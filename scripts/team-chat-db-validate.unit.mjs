import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

// jssecurity:S5145 (log injection) — a linha 40 do validador imprime o corpo da
// resposta REST (dado não-confiável) no console.error. Um `\n` no corpo não pode
// forjar uma linha nova no log. Executa-se o script de verdade (child process)
// com um `fetch` stubbed que devolve um corpo malicioso, e exige-se uma linha só.
// Mesmo padrão de scripts/ci/github-settings-guard.unit.mjs.
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'team-chat-db-validate.mjs');

/** Executa o validador de verdade com um `fetch` stubbed (child process). */
function executar(stubFonte, env = {}) {
  const stub = 'data:text/javascript,' + encodeURIComponent(stubFonte);
  return spawnSync(process.execPath, ['--import', stub, SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_URL: 'https://stub.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-key',
      ...env,
    },
  });
}

/** Stub que responde a tabela/coluna com 200 OK e o RPC com o erro pedido. */
function stubComRpc(status, corpo = 'boom') {
  return [
    'globalThis.fetch = async (url) => {',
    "  const u = String(url);",
    "  if (u.includes('/rpc/')) {",
    `    return { ok: ${status >= 200 && status < 300}, status: ${status}, text: async () => ${JSON.stringify(corpo)}, json: async () => ({}) };`,
    '  }',
    "  return { ok: true, status: 200, text: async () => '[]', json: async () => ([]) };",
    '};',
    '',
  ].join('\n');
}

const FETCH_STUB = [
  "globalThis.fetch = async () => ({",
  "  ok: false,",
  "  status: 500,",
  "  json: async () => ({}),",
  "  text: async () => 'corpo-vindo-do-rest\\n::error::forged-by-body',",
  "});",
  "",
].join('\n');

describe('team-chat-db-validate: log injection (jssecurity:S5145)', () => {
  it('neutraliza quebras de linha do corpo REST (linha 40)', () => {
    const res = executar(FETCH_STUB);
    const out = `${res.stdout}${res.stderr}`;
    const linhas = out.split('\n');

    const linhaErro = linhas.find((l) => l.includes('team_conversations') && l.includes('HTTP 500'));
    assert.ok(linhaErro, `linha de erro da tabela ausente na saída:\n${out}`);
    assert.ok(
      linhaErro.includes('corpo-vindo-do-rest ::error::forged-by-body'),
      `valor não-confiável vazou cru na linha 40: ${JSON.stringify(linhaErro)}`,
    );
    assert.ok(
      !linhas.includes('::error::forged-by-body'),
      `linha de log forjada emitida:\n${out}`,
    );
  });
});

// TC-012: o check de RPC aceitava "qualquer status diferente de 404", então um
// erro de autenticação (401/403) ou de servidor (500) era contado como sucesso e
// o validador saía 0 sem ter validado nada. O contrato correto é: só uma resposta
// que prove que o RPC existe e executou (HTTP 2xx) conta como aprovado.
describe('team-chat-db-validate: sucesso falso em resposta de erro (TC-012)', () => {
  for (const status of [500, 401, 403]) {
    it(`reprova e sai != 0 quando o RPC responde HTTP ${status}`, () => {
      const res = executar(stubComRpc(status));
      const out = `${res.stdout}${res.stderr}`;

      assert.ok(
        !out.includes('✓ rpc/accept_department_invite'),
        `resposta de erro HTTP ${status} contada como sucesso:\n${out}`,
      );
      assert.ok(
        out.includes('✗ rpc/accept_department_invite'),
        `falha do RPC não foi reportada:\n${out}`,
      );
      assert.ok(
        !out.includes('Todas as verificações passaram'),
        `validador declarou sucesso global com o RPC falhando:\n${out}`,
      );
      assert.notEqual(res.status, 0, `exit code deveria ser != 0:\n${out}`);
    });
  }

  it('aprova quando o RPC responde HTTP 200 (dry-run sem escrita)', () => {
    const res = executar(stubComRpc(200, '{"ok":false,"error":"invalid_or_expired_code"}'));
    const out = `${res.stdout}${res.stderr}`;

    assert.ok(out.includes('✓ rpc/accept_department_invite'), `RPC 200 não aprovado:\n${out}`);
    assert.equal(res.status, 0, `exit code deveria ser 0:\n${out}`);
    assert.ok(out.includes('Todas as verificações passaram'), `resumo de sucesso ausente:\n${out}`);
  });
});

// TC-012: os contratos usados pelo validador estavam obsoletos — a tabela
// `team_members` e a coluna `department_invites.token` não existem, e o RPC
// canônico é `accept_department_invite(p_code text)` (não `p_token`).
describe('team-chat-db-validate: contratos canônicos (TC-012)', () => {
  it('consulta team_conversation_members, department_invites.code e p_code', () => {
    const log = join(mkdtempSync(join(tmpdir(), 'team-chat-db-validate-')), 'pedidos.jsonl');
    const stub = [
      "import { appendFileSync } from 'node:fs';",
      'globalThis.fetch = async (url, init = {}) => {',
      "  appendFileSync(process.env.STUB_LOG, JSON.stringify({ url: String(url), body: init.body ?? null }) + '\\n');",
      "  if (String(url).includes('/rpc/')) return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };",
      "  return { ok: true, status: 200, text: async () => '[]', json: async () => ([]) };",
      '};',
      '',
    ].join('\n');

    const res = executar(stub, { STUB_LOG: log });
    assert.equal(res.status, 0, `validador deveria sair 0 com tudo 200:\n${res.stdout}${res.stderr}`);
    const pedidos = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const urls = pedidos.map((p) => p.url);

    assert.ok(
      urls.some((u) => u.includes('/rest/v1/team_conversation_members')),
      `tabela canônica team_conversation_members não foi consultada: ${urls.join(', ')}`,
    );
    assert.ok(
      !urls.some((u) => u.includes('/rest/v1/team_members?')),
      `tabela inexistente team_members ainda é consultada: ${urls.join(', ')}`,
    );
    assert.ok(
      urls.some((u) => u.includes('department_invites') && u.includes('select=code')),
      `coluna canônica department_invites.code não foi consultada: ${urls.join(', ')}`,
    );
    assert.ok(
      !urls.some((u) => u.includes('select=token')),
      `coluna inexistente department_invites.token ainda é consultada: ${urls.join(', ')}`,
    );

    const rpc = pedidos.find((p) => p.url.includes('/rpc/accept_department_invite'));
    assert.ok(rpc, `RPC accept_department_invite não foi chamado: ${urls.join(', ')}`);
    const payload = JSON.parse(rpc.body);
    assert.ok(
      Object.prototype.hasOwnProperty.call(payload, 'p_code'),
      `payload do RPC não usa p_code: ${rpc.body}`,
    );
    assert.ok(
      !Object.prototype.hasOwnProperty.call(payload, 'p_token'),
      `payload do RPC ainda usa p_token: ${rpc.body}`,
    );
  });
});
