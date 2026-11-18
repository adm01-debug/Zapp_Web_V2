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

import { RPC_PADRAO, limparFixture, logoutSessaoAtual, principal, principalLogout } from './e2e-teardown.mjs';

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
// O passo do YAML e onde o defeito vivia. O teste le o arquivo de verdade e trava
// as duas metades: a limpeza chama a RPC pelo script (com as credenciais do usuario
// de teste) e o passo nao carrega mais a chave mestra.

const WORKFLOW = readFileSync(new URL('../../.github/workflows/e2e-logado.yml', import.meta.url), 'utf8');
const NOME_PASSO = 'E2E teardown - limpar fixture de conversation_closures';

/** O bloco do passo: do `- name:` ate o proximo item da lista, sem o comentario do proximo. */
function passoDoWorkflow(texto, nome) {
  const linhas = texto.split('\n');
  const inicio = linhas.findIndex((l) => /^\s*- /.test(l) && l.includes(nome));
  assert.notEqual(inicio, -1, `passo "${nome}" nao existe no e2e-logado.yml`);
  let fim = inicio + 1;
  while (fim < linhas.length && !/^\s*- /.test(linhas[fim])) fim += 1;
  // O comentario que precede o PROXIMO passo fica na mesma indentacao do item: nao e
  // deste passo e nao pode entrar na assercao.
  while (fim > inicio + 1 && (linhas[fim - 1].trim() === '' || linhas[fim - 1].trim().startsWith('#'))) fim -= 1;
  return linhas.slice(inicio, fim).join('\n');
}

test('e2e-logado.yml: o teardown de conversation_closures chama a RPC com o login do usuario de teste', () => {
  const passo = passoDoWorkflow(WORKFLOW, NOME_PASSO);

  assert.match(
    passo,
    new RegExp(`node scripts/ci/e2e-teardown\\.mjs ${RPC_PADRAO}\\b`),
    'a limpeza tem de passar pelo script que autentica como o usuario de teste',
  );
  assert.doesNotMatch(
    passo,
    /SUPABASE_SERVICE_ROLE_KEY/,
    'o passo de limpeza nao pode carregar a chave mestra do banco',
  );
  assert.doesNotMatch(passo, /curl\b/, 'a limpeza direta por REST com a service role saiu deste passo');
  assert.match(passo, /secrets\.E2E_TEST_EMAIL/);
  assert.match(passo, /secrets\.E2E_TEST_PASSWORD/);
});

test('GA39: logout revoga a sessao do teardown sem scope=global (nao derruba run paralelo)', async () => {
  const { chamadas, impl } = fetchFalso({});
  const r = await logoutSessaoAtual({ ...args, fetchImpl: impl });
  assert.equal(r.status, 200);
  const saidas = chamadas.filter((c) => String(c.url).endsWith('/auth/v1/logout'));
  assert.equal(saidas.length, 1, 'um POST de logout por teardown');
  assert.doesNotMatch(String(saidas[0].url), /scope=global/, 'logout simples: so a sessao atual');
  assert.match(String(saidas[0].opcoes.headers.authorization), /^Bearer /, 'revoga o JWT obtido no login');
});

test('GA39: principal aceita o subcomando logout e pula sem credencial', async () => {
  const { impl } = fetchFalso({});
  assert.equal(await principal(['logout'], envBase(), impl), 0);
  assert.equal(await principal(['logout'], {}, impl), 0, 'sem credencial pula sem falhar');
});

// GA43: falha no teardown/logou anota ::warning:: (visivel no run) sem bloquear
// o CI (continue-on-error no YAML + exit 1 aqui). Senha nunca vai ao argv:
// viaja em env para o body JSON do fetch (sem jq/argv).
test('GA43: falha no teardown e no logout emite ::warning::', async () => {
  const erros = [];
  const consoleOriginal = console.error;
  console.error = (msg) => erros.push(String(msg));
  try {
    const { impl: implRuim } = fetchFalso({ loginStatus: 500 });
    assert.equal(await principalLogout(envBase(), implRuim), 1);
    assert.equal(await principal([RPC_PADRAO], envBase(), implRuim), 1);
  } finally {
    console.error = consoleOriginal;
  }
  assert.ok(erros.length >= 2, `esperava 2 erros, vi ${erros.length}`);
  for (const msg of erros) {
    assert.ok(msg.startsWith('::warning::'), `sem ::warning::: ${msg}`);
  }
});
