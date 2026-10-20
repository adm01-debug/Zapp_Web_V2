#!/usr/bin/env node
// E25 (docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md, achado G-09):
// limpeza da fixture do E2E logado SEM a chave mestra do banco.
//
// Antes: o passo "E2E teardown - limpar fixture de conversation_closures" do
// .github/workflows/e2e-logado.yml apagava a linha de teste com um `curl DELETE`
// autenticado por SUPABASE_SERVICE_ROLE_KEY -- a chave que ignora RLS e vale para o
// banco inteiro, exposta em um job que tambem roda `bun install`.
//
// Agora: a limpeza passa pela RPC public.e2e_cleanup_conversation_closures()
// (SECURITY DEFINER; so o contato fixo do fixture e so o usuario de teste via
// auth.uid()), chamada com o JWT do PROPRIO usuario de teste -- o mesmo
// E2E_TEST_EMAIL/E2E_TEST_PASSWORD que o Playwright ja usa. A service role deixa de
// existir no CI.
//
// A LOGICA MORA AQUI, e nao em shell dentro do YAML, por dois motivos: o passo fica
// de uma linha e a logica vira teste (`e2e-teardown.unit.mjs`, executado por
// `node --test scripts/ci/*.unit.mjs` no ci.yml).
//
// Uso: node scripts/ci/e2e-teardown.mjs <rpc>
//   env: SUPABASE_URL           URL do projeto (a mesma que o workflow ja cita)
//        SUPABASE_ANON_KEY      chave publica (`VITE_SUPABASE_PUBLISHABLE_KEY`)
//        E2E_TEST_EMAIL / E2E_TEST_PASSWORD   credenciais do usuario de teste
//
// Nenhum valor de credencial vai para o log: a saida so cita o nome da variavel
// ausente ou o nome da RPC.

/** Variaveis sem as quais a limpeza nao pode rodar (secret ausente = passo pulado). */
export const VARIAVEIS_NECESSARIAS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'E2E_TEST_EMAIL',
  'E2E_TEST_PASSWORD',
];

/** Nome da RPC que substitui o `curl DELETE` com service role. */
export const RPC_PADRAO = 'e2e_cleanup_conversation_closures';

/**
 * Autentica como o usuario de teste e chama a RPC com o JWT dele.
 * A service role NAO aparece em nenhum ponto: nem lida, nem enviada.
 */
export async function limparFixture({ rpc, url, anonKey, email, password, fetchImpl = globalThis.fetch }) {
  const base = String(url).replace(/\/+$/, '');

  const login = await fetchImpl(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login do usuario de teste recusado (HTTP ${login.status})`);

  const sessao = await login.json();
  const token = sessao && sessao.access_token;
  if (!token) throw new Error('login do usuario de teste nao devolveu access_token');

  const resposta = await fetchImpl(`${base}/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  if (!resposta.ok) throw new Error(`RPC ${rpc} recusada (HTTP ${resposta.status})`);

  return { rpc, status: resposta.status };
}

/** GA39 (defensivo): revoga a sessao obtida pelo PROPRIO teardown (logout simples,
 * SEM `scope=global`), para nao derrubar runs paralelos enquanto GA09 (concurrency
 * com grupo fixo) nao estiver verde. Nao limpa as sessoes antigas acumuladas --
 * isso e GA40, decisao do Joaquim.
 */
export async function logoutSessaoAtual({ url, anonKey, email, password, fetchImpl = globalThis.fetch }) {
  const base = String(url).replace(/\/+$/, '');
  const login = await fetchImpl(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login do usuario de teste recusado (HTTP ${login.status})`);
  const sessao = await login.json();
  const token = sessao && sessao.access_token;
  if (!token) throw new Error('login do usuario de teste nao devolveu access_token');
  const saida = await fetchImpl(`${base}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
  });
  if (!saida.ok) throw new Error(`logout recusado (HTTP ${saida.status})`);
  return { status: saida.status };
}

/** Devolve o codigo de saida do logout (0 = ok ou pulado; 1 = falhou, sem bloquear o CI). */
export async function principalLogout(env = process.env, fetchImpl = globalThis.fetch) {
  const faltando = VARIAVEIS_NECESSARIAS.filter((nome) => !env[nome]);
  if (faltando.length > 0) {
    console.log(`logout pulado: variavel(is) ausente(s): ${faltando.join(', ')}`);
    return 0;
  }
  try {
    const r = await logoutSessaoAtual({
      url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      email: env.E2E_TEST_EMAIL,
      password: env.E2E_TEST_PASSWORD,
      fetchImpl,
    });
    console.log(`logout OK (HTTP ${r.status})`);
    return 0;
  } catch (erro) {
    console.error(`::warning::logout falhou - nao bloqueia CI: ${erro.message}`);
    return 1;
  }
}

/** Devolve o codigo de saida do passo (0 = ok ou pulado; 1 = falhou). */
export async function principal(argv, env = process.env, fetchImpl = globalThis.fetch) {
  const rpc = argv[0];
  if (rpc === 'logout') return await principalLogout(env, fetchImpl);
  if (!rpc || !/^[a-z0-9_]+$/.test(rpc)) {
    console.error('uso: e2e-teardown.mjs <rpc>|logout');
    return 2;
  }

  // Secret nao configurado nao derruba o run: o passo tem `continue-on-error` e a
  // suite logada e que manda. O comportamento e o mesmo do step antigo, que saia 0
  // quando a chave estava ausente.
  const faltando = VARIAVEIS_NECESSARIAS.filter((nome) => !env[nome]);
  if (faltando.length > 0) {
    console.log(`teardown pulado: variavel(is) ausente(s): ${faltando.join(', ')}`);
    return 0;
  }

  try {
    const r = await limparFixture({
      rpc,
      url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      email: env.E2E_TEST_EMAIL,
      password: env.E2E_TEST_PASSWORD,
      fetchImpl,
    });
    console.log(`teardown OK (rpc ${r.rpc}, HTTP ${r.status})`);
    return 0;
  } catch (erro) {
    console.error(`::warning::teardown falhou - nao bloqueia CI: ${erro.message}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await principal(process.argv.slice(2)));
}
