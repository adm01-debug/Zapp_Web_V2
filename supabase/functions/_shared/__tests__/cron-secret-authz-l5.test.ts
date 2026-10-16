import { handleConnectionHealthCheck } from '../../connection-health-check/index.ts';
import { handleBatchFetchAvatars } from '../../batch-fetch-avatars/index.ts';

// ---------------------------------------------------------------------------
// L5 da matriz IA-004 — credencial de máquina do cron (x-cron-secret, segredo
// DEDICADO do Vault lido por RPC SECURITY DEFINER) no lugar da anon key no
// Authorization. A anon key é PÚBLICA (vai no bundle do front) e o gateway a
// aceitava como "um JWT válido": qualquer visitante anônimo passava daqui.
//
// As duas edges usam o MESMO guard (`_shared/cron-secret-auth.ts`), então a
// matriz de casos é parametrizada por edge — antes havia dois arquivos quase
// idênticos e o gate do Sonar reprovava a PR por duplicação (>3%).
//
// Tudo com mock em `_injected`: sem rede, sem banco, sem segredo real.
// ---------------------------------------------------------------------------

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TEST_SERVICE_KEY = 'eyJtest.servicekey.forauth';
// Chave anon "qualquer": é exatamente ela que o gateway + guarda antigo aceitavam.
const TEST_ANON_KEY = 'eyJtest.anonkey.publica.que-vai-no-bundle-do-front';

// requireEnv('EVOLUTION_*') roda DEPOIS do guard, no caminho já autorizado. O CI roda
// `deno test --allow-env`; fixamos os valores para o caso B1 chegar ao fim do handler
// (200) em vez de morrer em requireEnv.
Deno.env.set('EVOLUTION_API_URL', 'https://evolution.test');
Deno.env.set('EVOLUTION_API_KEY', 'test-evolution-key');

// O batch-fetch-avatars tem rate limit in-module (5/min por IP): cada request recebe
// um IP próprio para o 6º caso não virar 429 em vez de 401.
let ipSeq = 0;
function nextIp(): string {
  ipSeq += 1;
  return `10.0.0.${ipSeq}`;
}

/**
 * Fixtures FICTÍCIAS — nunca o valor real do Vault. O segredo real nasce in-db como
 * encode(gen_random_bytes(32),'hex') = 64 hex; a fixture só precisa ser distinta e
 * óbvia de que é de teste.
 */
interface EdgeSpec {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (req: Request, deps: any) => Promise<Response>;
  /** caminho usado na URL do Request */
  path: string;
  /** nome da RPC do Vault que o guard desta edge chama */
  rpc: string;
  fixture: string;
  /** tabela que o handler consulta depois do guard (o mock devolve vazio) */
  table: string;
  /** conferência extra do corpo no caminho feliz (200) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assertOkBody: (body: any) => void;
}

const EDGES: EdgeSpec[] = [
  {
    name: 'connection-health-check',
    handler: handleConnectionHealthCheck,
    path: 'connection-health-check',
    rpc: 'get_connection_health_check_cron_secret',
    fixture: 'TEST_CRON_SECRET_connection_health_check_fixture_nao_real_000000',
    table: 'whatsapp_connections',
    assertOkBody: (body) => assert(body.success === true, `body inesperado: ${JSON.stringify(body)}`),
  },
  {
    name: 'batch-fetch-avatars',
    handler: handleBatchFetchAvatars,
    path: 'batch-fetch-avatars',
    rpc: 'get_avatars_refresh_cron_secret',
    fixture: 'TEST_CRON_SECRET_avatars_refresh_fixture_nao_real_0000000000',
    table: 'contacts',
    assertOkBody: (body) => {
      // Sem contatos o handler fecha 200 ("todos já possuem avatar").
      assert(body.success === true && body.processed === 0, `body inesperado: ${JSON.stringify(body)}`);
    },
  },
];

function makeRequest(spec: EdgeSpec, opts: { cronSecret?: string; bearer?: string } = {}): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-forwarded-for': nextIp(),
  };
  if (opts.cronSecret !== undefined) headers['x-cron-secret'] = opts.cronSecret;
  if (opts.bearer !== undefined) headers['Authorization'] = `Bearer ${opts.bearer}`;
  return new Request(`https://edge.test/${spec.path}`, { method: 'POST', headers, body: '{}' });
}

function makeOptions(spec: EdgeSpec): Request {
  return new Request(`https://edge.test/${spec.path}`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://zapp-web-v2.vercel.app',
      'Access-Control-Request-Method': 'POST',
      'x-forwarded-for': nextIp(),
    },
  });
}

interface MockOpts {
  /** resposta da RPC do Vault (SECURITY DEFINER) */
  vaultSecret?: string | null;
  /** a RPC do Vault falha → fail-closed (o segredo nunca autoriza) */
  vaultError?: boolean;
  authUser?: { id: string } | null;
  authUserError?: boolean;
  /** linhas devolvidas pela tabela do handler (vazio = fecha 200 sem rede) */
  rows?: unknown[];
  serviceKey?: string;
}

interface MockCtx {
  rpcCalls: string[];
}

// Builder "thenable" no molde do multiplix-send/index.test.ts: a cadeia devolve o
// próprio builder e `await` resolve pelo conteúdo mockado, como o PostgREST faria.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableBuilder(spec: EdgeSpec, table: string, opts: MockOpts): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (): { data: any; error: any } => ({
    data: table === spec.table ? (opts.rows ?? []) : [],
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
function mockDeps(spec: EdgeSpec, opts: MockOpts, ctx: MockCtx): any {
  return {
    serviceKey: opts.serviceKey ?? TEST_SERVICE_KEY,
    supabase: {
      rpc(name: string) {
        ctx.rpcCalls.push(name);
        if (name === spec.rpc) {
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
        return tableBuilder(spec, table, opts);
      },
    },
  };
}

function newCtx(): MockCtx {
  return { rpcCalls: [] };
}

// ---------------------------------------------------------------- autenticação

for (const spec of EDGES) {
  Deno.test(`${spec.name} A1 (defeito): Bearer com anon key e sem x-cron-secret → 401`, async () => {
    // A anon key vai no bundle do front: qualquer visitante anônimo a tem. Antes do L5
    // ela passava como "um JWT válido" no gateway. Agora tem de cair em 401.
    const ctx = newCtx();
    const res = await spec.handler(makeRequest(spec, { bearer: TEST_ANON_KEY }), mockDeps(spec, { authUser: null }, ctx));
    assert(res.status === 401, `esperado 401 (anon key nao autoriza mais), recebido ${res.status}`);
    const body = await res.json();
    assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
    // Sem x-cron-secret o guard nem consulta o Vault.
    assert(ctx.rpcCalls.length === 0, `RPC nao deve ser chamada sem x-cron-secret: ${JSON.stringify(ctx.rpcCalls)}`);
  });

  Deno.test(`${spec.name} B1: x-cron-secret correto → NÃO é 401 (chamada segue no handler)`, async () => {
    const ctx = newCtx();
    const res = await spec.handler(
      makeRequest(spec, { cronSecret: spec.fixture }),
      mockDeps(spec, { vaultSecret: spec.fixture, rows: [] }, ctx),
    );
    assert(ctx.rpcCalls.includes(spec.rpc), 'o guard deve consultar a RPC do Vault');
    assert(res.status !== 401, `com o segredo correto a chamada nao pode dar 401, recebido ${res.status}`);
    // Caminho injetado: sem linhas o handler fecha 200 sem chamar a Evolution GO.
    assert(res.status === 200, `esperado 200 no caminho injetado, recebido ${res.status}`);
    spec.assertOkBody(await res.json());
  });

  Deno.test(`${spec.name} B2: x-cron-secret errado → 401`, async () => {
    const ctx = newCtx();
    const res = await spec.handler(
      makeRequest(spec, { cronSecret: 'wrong-secret-value' }),
      mockDeps(spec, { vaultSecret: spec.fixture }, ctx),
    );
    assert(res.status === 401, `esperado 401, recebido ${res.status}`);
    const body = await res.json();
    assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
  });

  Deno.test(`${spec.name} B3: RPC do Vault devolve erro → fail-closed → 401`, async () => {
    // Se a leitura do segredo falhar, o header nunca autoriza: nunca autorizar por um
    // valor que não pudemos comparar.
    const ctx = newCtx();
    const res = await spec.handler(
      makeRequest(spec, { cronSecret: spec.fixture }),
      mockDeps(spec, { vaultError: true }, ctx),
    );
    assert(res.status === 401, `esperado 401 (fail-closed), recebido ${res.status}`);
    const body = await res.json();
    assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
  });

  Deno.test(`${spec.name} B4: sem Authorization e sem x-cron-secret → 401`, async () => {
    const ctx = newCtx();
    const res = await spec.handler(makeRequest(spec, {}), mockDeps(spec, {}, ctx));
    assert(res.status === 401, `esperado 401, recebido ${res.status}`);
    const body = await res.json();
    assert(body.error === 'Unauthorized', `body inesperado: ${JSON.stringify(body)}`);
  });

  Deno.test(`${spec.name} B5: preflight OPTIONS → 200 com CORS (nunca vira 401)`, async () => {
    const ctx = newCtx();
    const res = await spec.handler(makeOptions(spec), mockDeps(spec, {}, ctx));
    // handleCors devolve new Response(null, { headers }) → status 200 (não 204).
    assert(res.status !== 401, 'o preflight OPTIONS jamais pode ser 401');
    assert(res.status === 200, `esperado 200 no preflight, recebido ${res.status}`);
    assert(Boolean(res.headers.get('access-control-allow-origin')), 'preflight sem Access-Control-Allow-Origin');
    assert(ctx.rpcCalls.length === 0, 'o preflight nao deve consultar a RPC do Vault');
  });
}
