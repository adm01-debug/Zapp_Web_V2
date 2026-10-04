import { handleConnectionHealthCheck } from './index.ts';
import { resetInstanceTokenCache } from '../_shared/evolution-instance-token.ts';

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos
   clients Supabase (SupabaseClient é genérico e não é importável no teste). */

// ---------------------------------------------------------------------------
// E24/TRA-002 — caminho SEM credencial da instância.
//
// A saúde de uma conexão é consultada na Evolution GO com o token DELA (Vault
// via get_instance_token). Quando o Vault não tem o token, o check NÃO pode
// cair na credencial da instância padrão — marcaria a saúde de A como sendo de
// B. O comportamento correto é explícito: health_status 'no_credentials' em
// whatsapp_connections E em connection_health_logs.status, e ZERO chamada ao
// provedor (nenhum GET /instance/connectionState sai).
//
// Tudo injetado: o supabase é um builder PostgREST falso (mesmo molde de
// _shared/__tests__/cron-secret-authz-l5.test.ts) e EVOLUTION_API_URL aponta
// para um servidor local que CONTA qualquer request — se a edge tentasse o
// provedor, a contagem sairia de zero e o teste falharia.
// ---------------------------------------------------------------------------

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CRON_FIXTURE = 'TEST_CRON_SECRET_health_check_fixture_nao_real_000000000';
const TEST_SERVICE_KEY = 'eyJtest.servicekey.forauth';
// Instância SEM token no Vault e SEM fallback: o fallback de transição só vale
// para EVOLUTION_INSTANCE_NAME, então os envs da instância padrão ficam fora.
Deno.env.delete('EVOLUTION_INSTANCE_NAME');
Deno.env.delete('EVOLUTION_INSTANCE_TOKEN');
Deno.env.set('EVOLUTION_API_KEY', 'test-evolution-key');

const CONN_SEM_TOKEN = {
  id: 'conn-sem-token',
  instance_id: 'LOJA_SEM_TOKEN',
  status: 'connected',
  phone_number: '5511999999999',
};

interface MockCtx {
  rpcCalls: string[];
  /** payloads gravados em connection_health_logs.insert */
  healthLogInserts: Record<string, unknown>[];
  /** payloads gravados em whatsapp_connections.update */
  connUpdates: Record<string, unknown>[];
}

// Builder thenable no molde do cron-secret-authz-l5.test.ts: cada método devolve
// o próprio builder e `await` resolve pelo conteúdo mockado, como o PostgREST.
function tableBuilder(table: string, ctx: MockCtx): any {
  const rows = () => ({ data: table === 'whatsapp_connections' ? [CONN_SEM_TOKEN] : [], error: null });
  const b: Record<string, any> = {};
  const chain = () => b;
  b.select = chain; b.eq = chain; b.neq = chain; b.or = chain; b.is = chain;
  b.in = chain; b.not = chain; b.lt = chain; b.order = chain; b.limit = chain;
  b.delete = chain;
  b.update = (payload: Record<string, unknown>) => {
    if (table === 'whatsapp_connections') ctx.connUpdates.push(payload);
    return b;
  };
  b.insert = (payload: Record<string, unknown>) => {
    if (table === 'connection_health_logs') ctx.healthLogInserts.push(payload);
    return b;
  };
  b.single = () => Promise.resolve(rows());
  b.maybeSingle = () => Promise.resolve(rows());
  b.then = (onFulfilled: any, onRejected: any) => Promise.resolve(rows()).then(onFulfilled, onRejected);
  return b;
}

function mockSupabase(ctx: MockCtx): any {
  return {
    rpc(name: string) {
      ctx.rpcCalls.push(name);
      if (name === 'get_connection_health_check_cron_secret') {
        return Promise.resolve({ data: CRON_FIXTURE, error: null });
      }
      // get_instance_token (e qualquer outra RPC) resolve sem token: caminho de
      // instância sem credencial no Vault.
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      getUser() {
        return Promise.resolve({ data: { user: null }, error: new Error('no user') });
      },
    },
    from(table: string) {
      return tableBuilder(table, ctx);
    },
  };
}

/** Servidor local que conta QUALQUER request — o GET /instance/connectionState incluído. */
function createCountingProvider() {
  const requests: { method: string; path: string }[] = [];
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, (req) => {
    requests.push({ method: req.method, path: new URL(req.url).pathname });
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const addr = server.addr;
  if (addr.transport !== 'tcp') throw new Error('counting provider: esperado listener TCP');
  return { url: `http://127.0.0.1:${addr.port}`, requests, stop: () => server.shutdown() };
}

Deno.test('TRA-002: conexão sem token no Vault vira no_credentials e NÃO consulta o provedor', async () => {
  resetInstanceTokenCache();
  const provider = createCountingProvider();
  Deno.env.set('EVOLUTION_API_URL', provider.url);
  try {
    const ctx: MockCtx = { rpcCalls: [], healthLogInserts: [], connUpdates: [] };
    const req = new Request('https://edge.test/connection-health-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_FIXTURE },
      body: '{}',
    });

    const res = await handleConnectionHealthCheck(req, {
      supabase: mockSupabase(ctx),
      serviceKey: TEST_SERVICE_KEY,
    });

    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    const result = body?.connections?.find((c: any) => c.instance_id === CONN_SEM_TOKEN.instance_id);
    assert(result?.status === 'no_credentials',
      `resultado da conexão sem token deve ser no_credentials: ${JSON.stringify(body)}`);

    // Prova 1: health_status 'no_credentials' gravado em whatsapp_connections.
    const update = ctx.connUpdates.find((u) => u.health_status !== undefined);
    assert(update?.health_status === 'no_credentials',
      `whatsapp_connections.health_status deve ser no_credentials: ${JSON.stringify(ctx.connUpdates)}`);

    // Prova 2: connection_health_logs recebeu status 'no_credentials'.
    const log = ctx.healthLogInserts.find((l) => l.connection_id === CONN_SEM_TOKEN.id);
    assert(log?.status === 'no_credentials',
      `connection_health_logs.status deve ser no_credentials: ${JSON.stringify(ctx.healthLogInserts)}`);

    // Prova 3: o Vault foi consultado e o provedor NUNCA foi chamado —
    // nenhum GET /instance/connectionState saiu com credencial emprestada.
    assert(ctx.rpcCalls.includes('get_instance_token'),
      `a edge deve consultar o token da instância no Vault: ${JSON.stringify(ctx.rpcCalls)}`);
    assert(provider.requests.length === 0,
      `nenhuma chamada pode ir ao provedor sem credencial da instância: ${JSON.stringify(provider.requests)}`);
  } finally {
    await provider.stop();
  }
});
