// E25: prova que a limpeza da fixture do E2E logado roda com o login do usuario de
// TESTE (JWT dele) e nao com a chave mestra do banco.
//
// Vermelho sem a correcao: antes, o passo do .github/workflows/e2e-logado.yml era um
// `curl DELETE` autenticado por SUPABASE_SERVICE_ROLE_KEY, e nem
// `scripts/ci/e2e-teardown.mjs` nem a RPC existiam. O caso do workflow falha no
// workflow antigo; os casos de comportamento falham sem o script.
//
// Roda offline: `fetch` e injetado (nenhuma rede, nenhum banco). O CI executa por
// `node --test scripts/ci/*.unit.mjs` (ci.yml).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertBlocking, jobOf, onlyStep, runOf, stepsOf } from './workflow-test-support.mjs';

import { RPC_PADRAO, limparFixture, principal } from './e2e-teardown.mjs';

const BASE = 'https://projeto-teste.supabase.co';
const CHAVE_PUBLICA = 'chave-publica-do-projeto';
const EMAIL = 'e2e@exemplo.invalid';
const SENHA = 'senha-de-teste';
const TOKEN = 'jwt-do-usuario-de-teste';
const SENTINELA_SERVICE_ROLE = 'valor-da-chave-mestra-que-nao-pode-viajar';

/** `fetch` de mentira que registra cada chamada. Nenhuma requisicao sai da maquina. */
function fetchFalso({ loginStatus = 200, rpcStatus = 200 } = {}) {
  const chamadas = [];
  const impl = async (url, opcoes = {}) => {
    chamadas.push({ url, opcoes });
    const ok = (status) => status >= 200 && status < 300;
    if (url.includes('/auth/v1/token')) {
      return { ok: ok(loginStatus), status: loginStatus, json: async () => ({ access_token: TOKEN }) };
    }
    return { ok: ok(rpcStatus), status: rpcStatus, json: async () => 1 };
  };
  return { chamadas, impl };
}

function envBase(extra = {}) {
  return {
    SUPABASE_URL: BASE,
    SUPABASE_ANON_KEY: CHAVE_PUBLICA,
    E2E_TEST_EMAIL: EMAIL,
    E2E_TEST_PASSWORD: SENHA,
    ...extra,
  };
}

const args = { rpc: RPC_PADRAO, url: BASE, anonKey: CHAVE_PUBLICA, email: EMAIL, password: SENHA };

test('autentica como o usuario de teste e chama a RPC com o JWT dele', async () => {
  const { chamadas, impl } = fetchFalso();
  const r = await limparFixture({ ...args, fetchImpl: impl });

  assert.equal(chamadas.length, 2, 'esperava exatamente login + RPC');
  const [login, rpc] = chamadas;

  assert.equal(login.url, `${BASE}/auth/v1/token?grant_type=password`);
  assert.equal(login.opcoes.method, 'POST');
  assert.equal(login.opcoes.headers.apikey, CHAVE_PUBLICA);
  assert.deepEqual(JSON.parse(login.opcoes.body), { email: EMAIL, password: SENHA });

  assert.equal(rpc.url, `${BASE}/rest/v1/rpc/${RPC_PADRAO}`);
  assert.equal(rpc.opcoes.method, 'POST');
  assert.equal(rpc.opcoes.headers.apikey, CHAVE_PUBLICA);
  assert.equal(
    rpc.opcoes.headers.authorization,
    `Bearer ${TOKEN}`,
    'a RPC tem de ser chamada com o JWT do usuario de teste, nao com a chave publica',
  );
  assert.equal(r.status, 200);
});

test('a chave mestra do banco nao entra em nenhuma requisicao', async () => {
  const { chamadas, impl } = fetchFalso();
  const codigo = await principal([RPC_PADRAO], envBase({ SUPABASE_SERVICE_ROLE_KEY: SENTINELA_SERVICE_ROLE }), impl);

  assert.equal(codigo, 0);
  assert.equal(chamadas.length, 2);
  const viagem = JSON.stringify(chamadas);
  assert.ok(
    !viagem.includes(SENTINELA_SERVICE_ROLE),
    'a service role foi enviada: e exatamente o defeito que a E25 fecha',
  );
  assert.ok(!/service_role/i.test(viagem), 'nenhuma referencia a service_role nas requisicoes');
});

test('credencial ausente pula o teardown sem falhar o run', async () => {
  const { chamadas, impl } = fetchFalso();
  const env = envBase();
  delete env.E2E_TEST_PASSWORD;

  const codigo = await principal([RPC_PADRAO], env, impl);

  assert.equal(codigo, 0, 'secret ausente nao pode derrubar o run');
  assert.deepEqual(chamadas, [], 'sem credencial nao se chama nem o login');
});

test('login recusado derruba o teardown antes de tocar na RPC', async () => {
  const { chamadas, impl } = fetchFalso({ loginStatus: 401 });

  await assert.rejects(() => limparFixture({ ...args, fetchImpl: impl }), /login do usuario de teste recusado/);
  assert.ok(
    !chamadas.some((c) => c.url.includes('/rest/v1/rpc/')),
    'a RPC foi chamada mesmo sem sessao',
  );
});

test('RPC recusada derruba o teardown', async () => {
  const { impl } = fetchFalso({ rpcStatus: 403 });

  await assert.rejects(
    () => limparFixture({ ...args, fetchImpl: impl }),
    new RegExp(`RPC ${RPC_PADRAO} recusada \\(HTTP 403\\)`),
  );
});

// ── Contrato do workflow ─────────────────────────────────────────────────────
// O script e os testes de sua RPC continuam preservados. O workflow restaurado
// executa agora um backend descartável: não autentica nem apaga fixtures na produção.
const WORKFLOW = readFileSync(new URL('../../.github/workflows/e2e-logado.yml', import.meta.url), 'utf8');

test('e2e-logado.yml: backend descartável substitui chamadas de teardown de produção', () => {
  const job = jobOf(WORKFLOW, 'e2e-logado');
  const controller = onlyStep(stepsOf(job), step => /bash scripts\/e2e-isolated\/run\.sh suite\b/.test(runOf(step)), 'controller com limpeza própria');
  assertBlocking(job, 4);
  assertBlocking(controller);
  assert.doesNotMatch(WORKFLOW, /node scripts\/ci\/e2e-teardown\.mjs|e2e_cleanup_conversation_closures|catalog_send_events|curl\b/);
  assert.doesNotMatch(WORKFLOW, /secrets\.|SUPABASE_SERVICE_ROLE_KEY|E2E_TEST_EMAIL|E2E_TEST_PASSWORD/);
});
