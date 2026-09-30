import { handleBatchFetchAvatars } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// L5 da matriz IA-004 — mesma credencial de máquina do cron do
// connection-health-check, agora na edge batch-fetch-avatars (job pg_cron
// 'avatars-refresh'): header x-cron-secret com o segredo DEDICADO
// avatars_refresh_cron_secret (Vault, lido por get_avatars_refresh_cron_secret,
// SECURITY DEFINER). A anon key deixa de autorizar. Mock em `_injected`, sem rede.
// ---------------------------------------------------------------------------

// Fixture FICTÍCIA — nunca o valor real do Vault.
const TEST_CRON_SECRET = 'TEST_CRON_SECRET_avatars_refresh_fixture_nao_real_0000000000';
const TEST_SERVICE_KEY = 'eyJtest.servicekey.forauth';
const TEST_ANON_KEY = 'eyJtest.anonkey.publica.que-vai-no-bundle-do-front';

Deno.env.set('EVOLUTION_API_URL', 'https://evolution.test');
Deno.env.set('EVOLUTION_API_KEY', 'test-evolution-key');

// O handler tem rate limit in-module (5/min por IP). Cada request recebe um IP
// próprio: o teste não depende de o guard vir antes ou depois do limiter, e o
// 6º caso não vira 429 em vez de 401.
let ipSeq = 0;
function nextIp(): string {
  ipSeq += 1;
  return `10.0.0.${ipSeq}`;
}

function makeRequest(opts: { cronSecret?: string; bearer?: string } = {}): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-forwarded-for': nextIp(),
  };
  if (opts.cronSecret !== undefined) headers['x-cron-secret'] = opts.cronSecret;
  if (opts.bearer !== undefined) headers['Authorization'] = `Bearer ${opts.bearer}`;
  return new Request('https://edge.test/batch-fetch-avatars', {
    method: 'POST',
    headers,
    body: '{}',
  });
}

function makeOptions(): Request {
  return new Request('https://edge.test/batch-fetch-avatars', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://zapp-web-v2.vercel.app',
      'Access-Control-Request-Method': 'POST',
      'x-forwarded-for': nextIp(),
    },
  });
}

interface ContactRow {
  id: string;
  phone: string | null;
  name: string | null;
  avatar_url: string | null;
  avatar_fetch_attempted_at: string | null;
  whatsapp_connection_id: string | null;
}

interface MockOpts {
  /** resposta da RPC get_avatars_refresh_cron_secret (SECURITY DEFINER no Vault) */
  vaultSecret?: string | null;
  /** a RPC do Vault falha → fail-closed */
  vaultError?: boolean;
  authUser?: { id: string } | null;
  authUserError?: boolean;
  /** contatos devolvidos pela consulta (vazio = handler fecha 200 sem rede) */
  contacts?: ContactRow[];
  serviceKey?: string;
}

interface MockCtx {
  rpcCalls: string[];
}

// Builder "thenable" no molde do model existente (multiplix-send/index.test.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableBuilder(table: string, opts: MockOpts): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (): { data: any; error: any } => ({
    data: table === 'contacts' ? (opts.contacts ?? []) : [],
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
        if (name === 'get_avatars_refresh_cron_secret') {
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
  const ctx = newCtx();
  const res = await handleBatchFetchAvatars(
    makeRequest({ bearer: TEST_ANON_KEY }),
    mockDeps({ authUser: null }, ctx),
  );
  assert(res.status === 401, `esperado 401 (anon key nao autoriza), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
  assert(ctx.rpcCalls.length === 0, `RPC nao deve ser chamada sem x-cron-secret: ${JSON.stringify(ctx.rpcCalls)}`);
});

Deno.test('auth B1: x-cron-secret correto → NÃO é 401 (chamada segue no handler)', async () => {
  const ctx = newCtx();
  const res = await handleBatchFetchAvatars(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    mockDeps({ vaultSecret: TEST_CRON_SECRET, contacts: [] }, ctx),
  );
  assert(ctx.rpcCalls.includes('get_avatars_refresh_cron_secret'), 'o guard deve consultar a RPC do Vault');
  assert(res.status !== 401, `com o segredo correto a chamada nao pode dar 401, recebido ${res.status}`);
  // Caminho injetado: sem contatos o handler fecha 200 ("todos já possuem avatar").
  assert(res.status === 200, `esperado 200 no caminho injetado, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true && body.processed === 0, `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test('auth B2: x-cron-secret errado → 401', async () => {
  const ctx = newCtx();
  const res = await handleBatchFetchAvatars(
    makeRequest({ cronSecret: 'wrong-secret-value' }),
    mockDeps({ vaultSecret: TEST_CRON_SECRET }, ctx),
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test('auth B3: RPC do Vault devolve erro → fail-closed → 401', async () => {
  const ctx = newCtx();
  const res = await handleBatchFetchAvatars(
    makeRequest({ cronSecret: TEST_CRON_SECRET }),
    mockDeps({ vaultError: true }, ctx),
  );
  assert(res.status === 401, `esperado 401 (fail-closed), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test('auth B4: sem Authorization e sem x-cron-secret → 401', async () => {
  const ctx = newCtx();
  const res = await handleBatchFetchAvatars(makeRequest({}), mockDeps({}, ctx));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test('auth B5: preflight OPTIONS → 200 com CORS (nunca vira 401)', async () => {
  const ctx = newCtx();
  const res = await handleBatchFetchAvatars(makeOptions(), mockDeps({}, ctx));
  // handleCors devolve new Response(null, { headers }) → status 200 (não 204).
  assert(res.status !== 401, 'o preflight OPTIONS jamais pode ser 401');
  assert(res.status === 200, `esperado 200 no preflight, recebido ${res.status}`);
  assert(
    Boolean(res.headers.get('access-control-allow-origin')),
    'preflight sem Access-Control-Allow-Origin',
  );
  assert(ctx.rpcCalls.length === 0, 'o preflight nao deve consultar a RPC do Vault');
});
