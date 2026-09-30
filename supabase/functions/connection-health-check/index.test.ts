import { handleConnectionHealthCheck } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// L5 da matriz IA-004 — credencial de máquina do cron (x-cron-secret, segredo
// DEDICADO do Vault lido por RPC SECURITY DEFINER) no lugar da anon key no
// Authorization. A anon key é PÚBLICA (vai no bundle do front) e o gateway a
// aceitava como "um JWT válido": qualquer visitante anônimo passava daqui.
// Estes testes travam o guard com mock em `_injected` (sem rede).
// ---------------------------------------------------------------------------

// Fixture FICTÍCIA — nunca o valor real do Vault. O segredo real nasce in-db
// como encode(gen_random_bytes(32),'hex') = 64 hex; a fixture não precisa ter
// esse formato, só precisa ser distinta e óbvia de que é de teste.
const TEST_CRON_SECRET = 'TEST_CRON_SECRET_connection_health_check_fixture_nao_real_000000';
const TEST_SERVICE_KEY = 'eyJtest.servicekey.forauth';
// Chave anon "qualquer": era exatamente ela que o gateway+guarda antigo aceitavam.
const TEST_ANON_KEY = 'eyJtest.anonkey.publica.que-vai-no-bundle-do-front';

// requireEnv('EVOLUTION_API_URL' | 'EVOLUTION_API_KEY') roda DEPOIS do guard, no
// caminho já autorizado. O CI roda `deno test --allow-env`; fixamos os valores
// para o caso B1 chegar ao fim do handler (200) em vez de morrer em requireEnv.
Deno.env.set('EVOLUTION_API_URL', 'https://evolution.test');
Deno.env.set('EVOLUTION_API_KEY', 'test-evolution-key');

function makeRequest(opts: { cronSecret?: string; bearer?: string } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.cronSecret !== undefined) headers['x-cron-secret'] = opts.cronSecret;
  if (opts.bearer !== undefined) headers['Authorization'] = `Bearer ${opts.bearer}`;
  return new Request('https://edge.test/connection-health-check', {
    method: 'POST',
    headers,
    body: '{}',
  });
}

function makeOptions(): Request {
  return new Request('https://edge.test/connection-health-check', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://zapp-web-v2.vercel.app',
      'Access-Control-Request-Method': 'POST',
    },
  });
}

interface ConnectionRow {
  id: string;
  instance_id: string;
  status: string;
  phone_number: string | null;
}

interface MockOpts {
  /** resposta da RPC get_connection_health_check_cron_secret (SECURITY DEFINER no Vault) */
  vaultSecret?: string | null;
  /** a RPC do Vault falha → fail-closed (o segredo nunca autoriza) */
  vaultError?: boolean;
  authUser?: { id: string } | null;
  authUserError?: boolean;
  /** conexões devolvidas por whatsapp_connections (vazio = handler fecha 200 sem rede) */
  connections?: ConnectionRow[];
  serviceKey?: string;
}

interface MockCtx {
  rpcCalls: string[];
}

// Builder "thenable" no molde do multiplier-send: a cadeia devolve o próprio
// builder e `await` resolve pelo conteúdo mockado, como o PostgREST faria.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableBuilder(table: string, opts: MockOpts): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (): { data: any; error: any } => ({
    data: table === 'whatsapp_connections' ? (opts.connections ?? []) : [],
    error: null,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  const chain = () => b;
  b.select = chain; b.eq = chain; b.neq = chain; b.or = chain; b.is = chain;
  b.in = chain; b.not = chain; b.update = chain; b.insert = chain;
  b.delete = chain; b.lt = chain; b.order = chain; b.limit = chain;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.single = () => Promise.resolve(rows() as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.maybeSingle = () => Promise.resolve(rows() as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.then = (onFulfilled: any, onRejected: any) => Promise.resolve(rows()).then(onFulfilled, onRejected);
  return b;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDeps(opts: MockOpts, ctx: MockCtx): any {
  return {
    serviceKey: opts.serviceKey ?? TEST_SERVICE_KEY,
    supabase: {
      rpc(name: string) {
        ctx.rpcCalls.push(name);
        if (name === 'get_connection_health_check_cron_secret') {
          if (opts.vaultError) return Promise.resolve({ data: null, error: new Error('vault rpc failed') });
          return Promise.resolve({ data: opts.vaultSecret ?? null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      auth: {
        getUser(_token: string) {
          if (opts.authUserError) {
            return Promise.resolve({ data: { user: null }, error: new Error('invalid token') });
          }
          const user = opts.authUser ?? null;
          return Promise.resolve({ data: { user }, error: user ? null : new Error('no user') });
        },
      },
      from(table: string) {
        return tableBuilder(table, opts);
      },
    },
  };
}

function newCtx(): MockCtx {
  return { rpcCalls: [] };
}

// ---------------------------------------------------------------- autenticação

Deno.test('auth A1 (defeito): Bearer com anon key e sem x-cron-secret → 401', async () => {
  // A anon key vai no bundle do front: qualquer visitante anônimo a tem. Antes
  // do L5 ela passava como "um JWT válido" no gateway. Agora tem de cair em 401.
  const ctx = newCtx();
  const res = await handleConnectionHealthCheck(
    makeRequest({ bearer: TEST_ANON_KEY }),
    mockDeps({ authUser: null }, ctx),
  );
  assert(res.status === 401, `esperado 401 (anon key nao autoriza mais), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
  // Sem x-cron-secret o guard nem consulta o Vault.
  assert(ctx.rpcCalls.length === 0, `RPC nao deve ser chamada sem x-cron-secret: ${JSON.stringify(ctx.rpcCalls)}`);
});

Deno.test('auth B1: x-cron-secret correto → NÃO é 401 (chamada segue no handler)', async () => {
  const ctx = newCtx();
  const res = await handleConnectionHealthCheck(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    mockDeps({ vaultSecret: TEST_CRON_SECRET, connections: [] }, ctx),
  );
  assert(ctx.rpcCalls.includes('get_connection_health_check_cron_secret'), 'o guard deve consultar a RPC do Vault');
  assert(res.status !== 401, `com o segredo correto a chamada nao pode dar 401, recebido ${res.status}`);
  // Caminho injetado: sem conexões o handler fecha 200 sem chamar a Evolution GO.
  assert(res.status === 200, `esperado 200 no caminho injetado, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test('auth B2: x-cron-secret errado → 401', async () => {
  const ctx = newCtx();
  const res = await handleConnectionHealthCheck(
    makeRequest({ cronSecret: 'wrong-secret-value' }),
    mockDeps({ vaultSecret: TEST_CRON_SECRET }, ctx),
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test('auth B3: RPC do Vault devolve erro → fail-closed → 401', async () => {
  // Se a leitura do segredo falhar, isCronAuth fica false: nunca autorizar o
  // cron por um valor que nao pudemos comparar.
  const ctx = newCtx();
  const res = await handleConnectionHealthCheck(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    mockDeps({ vaultError: true }, ctx),
  );
  assert(res.status === 401, `esperado 401 (fail-closed), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test('auth B4: sem Authorization e sem x-cron-secret → 401', async () => {
  const ctx = newCtx();
  const res = await handleConnectionHealthCheck(makeRequest({}), mockDeps({}, ctx));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test('auth B5: preflight OPTIONS → 200 com CORS (nunca vira 401)', async () => {
  const ctx = newCtx();
  const res = await handleConnectionHealthCheck(makeOptions(), mockDeps({}, ctx));
  // handleCors devolve new Response(null, { headers }) → status 200 (não 204).
  assert(res.status !== 401, 'o preflight OPTIONS jamais pode ser 401');
  assert(res.status === 200, `esperado 200 no preflight, recebido ${res.status}`);
  assert(
    Boolean(res.headers.get('access-control-allow-origin')),
    'preflight sem Access-Control-Allow-Origin',
  );
  assert(ctx.rpcCalls.length === 0, 'o preflight nao deve consultar a RPC do Vault');
});
