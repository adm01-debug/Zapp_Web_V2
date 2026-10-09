import { handleConnectionHealthCheck } from './index.ts';

// ---------------------------------------------------------------------------
// SL-053 / F3 E23-E29 do plano multi-conexão (E24/E25/E26/E28).
//
// E24 — health-check POR INSTÂNCIA: a rota de status da evolução identifica a
//   instância pela CREDENCIAL (o nome no path v2 se perde na tradução para o GO).
//   Sem o token da própria conexão, o tradutor falha fechado (400 'instance
//   token ausente') para toda conexão que não é a padrão e só a instância padrão
//   é consultada — a outra fica 'error' para sempre. O teste exige que CADA
//   conexão consulte o provedor com o token DELA (Vault via get_instance_token) e
//   nunca com a chave global.
// E25 — 'logado mas sem socket' (Connected:false, LoggedIn:true) é 'connecting' e
//   o health grava 'degraded', nunca 'healthy' (e não sobrescreve o status).
// E26 — duas detecções iguais da mesma queda produzem UM único alerta (CAS pelo
//   status lido: a segunda leitura já vê 'disconnected').
// E28 — o estado que o monitoramento por instância consome: 401/403 vira
//   'no_credentials', sem sobrescrever o status da conexão e sem alerta de queda.
//
// Tudo com client injetado e fetch de mentira: sem rede, sem banco, sem segredo
// real. Nenhuma chamada sai daqui.
// ---------------------------------------------------------------------------

const CRON_SECRET = 'TEST_CRON_SECRET_health_fixture_nao_real_000000000000';

Deno.env.set('EVOLUTION_API_URL', 'https://evolution.test');
Deno.env.set('EVOLUTION_API_KEY', 'test-evolution-key');
// O defeito do E24 só aparece no flavor GO (é ele que seleciona a instância pela
// credencial); explicitamos o flavor para o teste não depender do default.
Deno.env.set('EVOLUTION_API_FLAVOR', 'go');
Deno.env.set('EVOLUTION_INSTANCE_NAME', 'padrao');
Deno.env.set('EVOLUTION_INSTANCE_TOKEN', 'tok-legado-da-padrao');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface ConnRow {
  id: string;
  instance_id: string;
  phone_number: string | null;
}

interface Fake {
  rows: ConnRow[];
  /** status VIVO por id — o CAS do handler transiciona por aqui */
  statusById: Record<string, string | null>;
  /** token por instância como o Vault devolveria (get_instance_token) */
  tokens: Record<string, string | null>;
  /** get_instance_token falha (leitura do Vault indisponível) */
  tokenRpcError: boolean;
  alerts: Array<Record<string, unknown>>;
  healthLogs: Array<Record<string, unknown>>;
  connUpdates: Array<Record<string, unknown>>;
  calls: Array<{ path: string; apikey: string | null }>;
  rpcCalls: string[];
  fetchImpl: (call: { path: string; apikey: string | null }) => Response;
}

function baseFake(): Fake {
  return {
    rows: [],
    statusById: {},
    tokens: {},
    tokenRpcError: false,
    alerts: [],
    healthLogs: [],
    connUpdates: [],
    calls: [],
    rpcCalls: [],
    fetchImpl: () => jsonResponse({ instance: { state: 'open' } }),
  };
}

/** Emula o predicado do CAS (`status.is.null` / `status.eq.<valor>`). */
function matchesOldStatus(orExpr: string, status: string | null): boolean {
  if (orExpr.includes('status.is.null')) return status === null || status === undefined;
  const m = orExpr.match(/status\.eq\.(.*)$/);
  if (!m) return false;
  return status === m[1];
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function result(
  fake: Fake,
  table: string,
  op: string,
  pending: Row | null,
  filters: Array<[string, string]>,
  orExpr: string,
): { data: unknown; error: unknown } {
  if (table === 'whatsapp_connections' && op === 'update' && pending) {
    fake.connUpdates.push(pending);
    if ('status' in pending) {
      const id = filters.find(([c]) => c === 'id')?.[1] ?? '';
      const row = fake.rows.find((r) => r.id === id);
      const atual = row ? (fake.statusById[row.id] ?? null) : null;
      if (!row || !matchesOldStatus(orExpr, atual)) return { data: [], error: null };
      fake.statusById[row.id] = pending.status as string;
      return { data: [{ id: row.id }], error: null };
    }
    return { data: null, error: null };
  }
  if (table === 'connection_health_logs' && op === 'insert' && pending) {
    fake.healthLogs.push(pending);
    return { data: null, error: null };
  }
  if (table === 'warroom_alerts' && op === 'insert' && pending) {
    fake.alerts.push(pending);
    return { data: null, error: null };
  }
  if (op === 'select' && table === 'whatsapp_connections') {
    // Mesmo filtro do handler: a fixture de E2E nunca entra no health check.
    return {
      data: fake.rows
        .filter((r) => r.instance_id !== 'E2E_FIXTURE')
        .map((r) => ({ ...r, status: fake.statusById[r.id] ?? null })),
      error: null,
    };
  }
  return { data: [], error: null };
}

function builder(fake: Fake, table: string): Row {
  let op = 'select';
  let pending: Row | null = null;
  const filters: Array<[string, string]> = [];
  let orExpr = '';
  const self: Row = {};
  const chain = () => self;
  self.select = chain;
  self.neq = chain;
  self.not = chain;
  self.lt = chain;
  self.limit = chain;
  self.order = chain;
  self.eq = (c: string, v: string) => {
    filters.push([c, v]);
    return self;
  };
  self.is = (c: string, v: string) => {
    filters.push([c, v]);
    return self;
  };
  self.or = (expr: string) => {
    orExpr = expr;
    return self;
  };
  self.insert = (payload: Row) => {
    op = 'insert';
    pending = payload;
    return self;
  };
  self.update = (payload: Row) => {
    op = 'update';
    pending = payload;
    return self;
  };
  self.delete = () => {
    op = 'delete';
    return self;
  };
  const done = () => Promise.resolve(result(fake, table, op, pending, filters, orExpr));
  self.single = done;
  self.maybeSingle = done;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  self.then = (onFulfilled: any, onRejected: any) => done().then(onFulfilled, onRejected);
  return self;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDeps(fake: Fake): any {
  return {
    serviceKey: 'eyJtest.servicekey.forauth',
    supabase: {
      rpc(name: string, params?: Row) {
        fake.rpcCalls.push(name);
        if (name === 'get_connection_health_check_cron_secret') {
          return Promise.resolve({ data: CRON_SECRET, error: null });
        }
        // E24: credencial POR INSTÂNCIA lida do Vault.
        if (name === 'get_instance_token') {
          if (fake.tokenRpcError) return Promise.resolve({ data: null, error: new Error('vault rpc failed') });
          const instance = params?.p_instance_id as string;
          return Promise.resolve({ data: fake.tokens[instance] ?? null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: new Error('no user') }),
      },
      from: (table: string) => builder(fake, table),
    },
  };
}

function makeRequest(): Request {
  return new Request('https://edge.test/connection-health-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
  });
}

/** Roda o handler com o fetch global trocado pelo fake (e restaurado depois). */
async function run(fake: Fake): Promise<Response> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const apikey = ((init?.headers ?? {}) as Record<string, string>).apikey ?? null;
    fake.calls.push({ path, apikey });
    return Promise.resolve(fake.fetchImpl({ path, apikey }));
  }) as typeof fetch;
  try {
    return await handleConnectionHealthCheck(makeRequest(), makeDeps(fake));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// ─────────────────────────────── E24 ───────────────────────────────────────

Deno.test('E24: cada conexão consulta o provedor com o token DELA, nunca com a chave global', async () => {
  const fake = baseFake();
  fake.rows = [
    { id: 'c1', instance_id: 'padrao', phone_number: null },
    { id: 'c2', instance_id: 'inst-b', phone_number: null },
  ];
  fake.statusById = { c1: 'connected', c2: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao', 'inst-b': 'tok-da-inst-b' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });

  const res = await run(fake);
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);

  // No flavor GO a instância é escolhida pela CREDENCIAL, então duas conexões =
  // duas chamadas, cada uma com o token da sua instância.
  assert(
    fake.calls.length === 2,
    `esperado uma consulta por conexão (2), recebido ${fake.calls.length}: ${JSON.stringify(fake.calls)}`,
  );
  const apikeys = fake.calls.map((c) => c.apikey).sort();
  assert(
    JSON.stringify(apikeys) === JSON.stringify(['tok-da-inst-b', 'tok-da-padrao']),
    `cada chamada tem de levar o token da própria instância, recebido ${JSON.stringify(apikeys)}`,
  );
  assert(
    !fake.calls.some((c) => c.apikey === 'test-evolution-key' || c.apikey === 'tok-legado-da-padrao'),
    `a credencial global/legada não pode ser usada numa rota de instância: ${JSON.stringify(fake.calls)}`,
  );

  // E24: as duas instâncias têm estado independente — a segunda não é 'error'.
  const statusById: Record<string, unknown> = {};
  for (const log of fake.healthLogs) statusById[log.instance_id as string] = log.status;
  assert(
    statusById['padrao'] === 'healthy' && statusById['inst-b'] === 'healthy',
    `as duas instâncias deveriam estar 'healthy': ${JSON.stringify(statusById)}`,
  );
});

Deno.test('E24: sem token próprio no Vault a instância não é consultada com a credencial de outra', async () => {
  // 'inst-b' sem token cadastrado: o tradutor falha fechado ANTES da rede (nunca
  // com a key global) e o monitoramento registra o estado próprio.
  const fake = baseFake();
  fake.rows = [{ id: 'c2', instance_id: 'inst-b', phone_number: null }];
  fake.statusById = { c2: 'connected' };
  fake.tokens = {};

  const res = await run(fake);
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(fake.calls.length === 0, `sem token não pode haver chamada de rede: ${JSON.stringify(fake.calls)}`);
  assert(
    fake.healthLogs[0]?.status === 'no_credentials',
    `esperado health_status 'no_credentials', recebido ${JSON.stringify(fake.healthLogs)}`,
  );
});

Deno.test('E24: falha ao LER a credencial do Vault não usa a rede e registra o motivo', async () => {
  // Ramo de erro: a RPC do Vault falha. A sonda continua fail-closed (não chama o
  // provedor com a credencial de outra instância) e a falha fica distinguível de
  // "instância sem token cadastrado" pelo error_message.
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'inst-b', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-b': 'tok-da-inst-b' };
  fake.tokenRpcError = true;

  const res = await run(fake);
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(fake.calls.length === 0, `não pode consultar a rede sem credencial: ${JSON.stringify(fake.calls)}`);
  assert(
    fake.healthLogs[0]?.status === 'no_credentials',
    `esperado 'no_credentials': ${JSON.stringify(fake.healthLogs)}`,
  );
  assert(
    String(fake.healthLogs[0]?.error_message ?? '').includes('get_instance_token'),
    `o motivo da falha de leitura tem de ficar registrado: ${JSON.stringify(fake.healthLogs)}`,
  );
});

// ─────────────────────────────── E25 ───────────────────────────────────────

Deno.test('E25: GO logada SEM socket (Connected:false, LoggedIn:true) → degraded, nunca healthy', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ message: 'success', data: { Connected: false, LoggedIn: true } });

  await run(fake);
  assert(
    fake.healthLogs[0]?.status === 'degraded',
    `'connecting' tem de gravar 'degraded': ${JSON.stringify(fake.healthLogs)}`,
  );
  assert(
    !fake.connUpdates.some((u) => 'status' in u),
    `estado transitório não pode sobrescrever o status da conexão: ${JSON.stringify(fake.connUpdates)}`,
  );
});

// ─────────────────────────────── E26 ───────────────────────────────────────

Deno.test('E26: duas detecções iguais da mesma queda produzem UM único alerta', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'close' } });

  await run(fake);
  await run(fake);

  const alertas = fake.alerts.filter((a) => a.source === 'connection-health-check');
  assert(alertas.length === 1, `esperado 1 alerta para uma única queda, recebido ${alertas.length}`);
  const paraDisconnected = fake.connUpdates.filter((u) => u.status === 'disconnected');
  assert(
    paraDisconnected.length === 1,
    `o CAS pelo status lido só pode transicionar uma vez: ${JSON.stringify(fake.connUpdates)}`,
  );
});

// ─────────────────────────────── E28 ───────────────────────────────────────

Deno.test('E28: 401 do provedor vira no_credentials — sem alerta de queda e sem sobrescrever o status', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ error: 'unauthorized' }, 401);

  await run(fake);
  assert(
    fake.healthLogs[0]?.status === 'no_credentials',
    `401 tem de virar 'no_credentials': ${JSON.stringify(fake.healthLogs)}`,
  );
  assert(fake.alerts.length === 0, `credencial inválida não é queda: ${JSON.stringify(fake.alerts)}`);
  assert(
    !fake.connUpdates.some((u) => 'status' in u),
    `401 não pode sobrescrever o status da conexão: ${JSON.stringify(fake.connUpdates)}`,
  );
});
