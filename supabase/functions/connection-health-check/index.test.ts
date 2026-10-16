import { handleConnectionHealthCheck, evaluateOpenConnectionHealth, parseOwnerJid, parseSilenceMinutes, inboxSilenceDedupeKey } from './index.ts';

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
  /** corpos POST capturados (Resend) */
  bodies: Array<unknown>;
  /** última mensagem recebida por conexão (camada 3 / caixa muda) */
  lastInbound: Array<{ created_at: string }>;
  /** admins para o e-mail de queda (opt-in desliga quando vazio) */
  adminProfiles: Array<Record<string, unknown>>;
  /** pushes gravados em notifications */
  pushNotifications: Array<unknown>;
  /** deletes no warroom (testemunha do auto-resolve) */
  alertDeletes: Array<unknown>;
  /** dentro do horário comercial? (RPC is_within_business_hours) */
  withinHours: boolean;
  /** get_instance_token falha (leitura do Vault indisponível) */
  tokenRpcError: boolean;
  alerts: Array<Record<string, unknown>>;
  healthLogs: Array<Record<string, unknown>>;
  connUpdates: Array<Record<string, unknown>>;
  /** tabelas alvo de CADA insert (testemunha do espelho: push vai a `notifications`) */
  insertTables: string[];
  calls: Array<{ path: string; apikey: string | null }>;
  rpcCalls: string[];
  fetchImpl: (call: { path: string; apikey: string | null }) => Response | Promise<Response>;
}

function baseFake(): Fake {
  return {
    rows: [],
    statusById: {},
    tokens: {},
    tokenRpcError: false,
    bodies: [],
    lastInbound: [],
    adminProfiles: [],
    pushNotifications: [],
    alertDeletes: [],
    withinHours: false,
    alerts: [],
    healthLogs: [],
    connUpdates: [],
    insertTables: [],
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
    fake.insertTables.push(table);
    fake.healthLogs.push(pending);
    return { data: null, error: null };
  }
  if (table === 'warroom_alerts' && op === 'insert' && pending) {
    fake.insertTables.push(table);
    fake.alerts.push(pending);
    return { data: null, error: null };
  }
  if (table === 'warroom_alerts' && op === 'delete') {
    fake.alertDeletes.push(filters);
    return { data: null, error: null };
  }
  if (table === 'messages' && op === 'select') {
    return { data: fake.lastInbound[0] ?? null, error: null };
  }
  if (table === 'profiles' && op === 'select') {
    return { data: fake.adminProfiles, error: null };
  }
  if (table === 'notifications' && op === 'insert' && pending) {
    fake.insertTables.push(table);
    fake.pushNotifications.push(pending);
    return { data: null, error: null };
  }
  if (table === 'global_settings' && op === 'select') {
    return { data: null, error: null };
  }
  if (op === 'select' && table === 'whatsapp_connections') {
    // Mesmo filtro do handler: a fixture de E2E nunca entra no health check. O
    // `.eq('instance_id', ...)` do alvo único é aplicado aqui (o handler filtra
    // pela instância pedida).
    const instanceFilter = filters.find(([c]) => c === 'instance_id')?.[1];
    return {
      data: fake.rows
        .filter((r) => r.instance_id !== 'E2E_FIXTURE')
        .filter((r) => instanceFilter === undefined || r.instance_id === instanceFilter)
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
        // PE-87: dentro/fora do horário comercial (contracheque da "caixa muda").
        if (name === 'is_within_business_hours') {
          return Promise.resolve({ data: fake.withinHours, error: null });
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
async function run(fake: Fake, req?: Request, deps?: unknown): Promise<Response> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const apikey = ((init?.headers ?? {}) as Record<string, string>).apikey ?? null;
    fake.calls.push({ path, apikey });
    fake.bodies.push((init as { body?: unknown } | undefined)?.body ?? null);
    return Promise.resolve(fake.fetchImpl({ path, apikey }));
  }) as typeof fetch;
  try {
    return await handleConnectionHealthCheck(req ?? makeRequest(), deps ?? makeDeps(fake));
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
  // duas consultas de estado, cada uma com o token da sua instância. (A camada
  // de identidade/owner faz chamadas extras à parte — não entram aqui.)
  const stateCalls = fake.calls.filter((c) => c.path.includes('/instance/status'));
  assert(
    stateCalls.length === 2,
    `esperado uma consulta de estado por conexão (2), recebido ${stateCalls.length}: ${JSON.stringify(fake.calls)}`,
  );
  const apikeys = stateCalls.map((c) => c.apikey).sort();
  assert(
    JSON.stringify(apikeys) === JSON.stringify(['tok-da-inst-b', 'tok-da-padrao']),
    `cada chamada tem de levar o token da própria instância, recebido ${JSON.stringify(apikeys)}`,
  );
  // A regra "nunca a chave global" vale para a ROTA DE ESTADO (por instância,
  // auth "instance" no evolution-go-routes). A camada de identidade usa a rota
  // ADMIN de listagem (/instance/fetchInstances → /instance/all, auth "admin"):
  // ela leva a chave do servidor e não personifica outra instância — por isso
  // fica fora desta asserção (filtrar só stateCalls, não todas as chamadas).
  // Mas a listagem também é presa: existe (uma por conexão aberta) e leva a
  // chave do servidor, nunca token de instância.
  const ownerCalls = fake.calls.filter((c) => c.path.includes('/instance/all'));
  assert(
    ownerCalls.length === 2,
    `camada de identidade tem de consultar o dono de cada conexão aberta (2), recebido ${ownerCalls.length}`,
  );
  assert(
    ownerCalls.every((c) => c.apikey === 'test-evolution-key'),
    `a rota ADMIN de listagem usa a chave do servidor, nunca token de instância: ${JSON.stringify(ownerCalls)}`,
  );
  // E o token legado não aparece em chamada nenhuma (nem estado, nem listagem).
  assert(
    !fake.calls.some((c) => c.apikey === 'tok-legado-da-padrao'),
    `token legado não pode vazar em nenhuma rota: ${JSON.stringify(fake.calls)}`,
  );
  assert(
    !stateCalls.some((c) => c.apikey === 'test-evolution-key' || c.apikey === 'tok-legado-da-padrao'),
    `a rota de estado (por instância) não pode usar a credencial global/legada: ${JSON.stringify(stateCalls)}`,
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

// ---------------------------------------------------------------------------
// SL-053 / N-162: chamada por usuário exige admin/supervisor e tem limite.
//
// O DEFEITO que esta matriz fecha: a dispensa de papel/limite era decidida pela
// PRESENÇA do header `x-cron-secret`, não pelo SEGREDO conferido. Bastava mandar
// `x-cron-secret: qualquer-coisa` junto de um Bearer válido de conta sem privilégio
// para o gate de admin/supervisor e o rate limit serem pulados. Por isso o último
// caso abaixo manda segredo INVÁLIDO + Bearer de não-admin e exige 403: sem essa
// prova, a presença do header escondia o bypass.
// ---------------------------------------------------------------------------

const AGENT_TOKEN = 'bearer-agent-token-non-admin';
const ADMIN_TOKEN = 'bearer-admin-token';

function makeUserRequest(token: string, ip = '10.0.0.1', extraHeaders: Record<string, string> = {}): Request {
  return new Request('https://edge.test/connection-health-check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-forwarded-for': ip,
      ...extraHeaders,
    },
  });
}

function makeDepsWithUser(fake: Fake, userId: string, isAdmin: boolean, extraRpcCalls: Record<string, unknown> = {}) {
  return {
    serviceKey: 'eyJtest.servicekey.forauth',
    supabase: {
      rpc(name: string, params?: Row) {
        fake.rpcCalls.push(name);
        if (name === 'get_connection_health_check_cron_secret') {
          return Promise.resolve({ data: CRON_SECRET, error: null });
        }
        if (name === 'get_instance_token') {
          if (fake.tokenRpcError) return Promise.resolve({ data: null, error: new Error('vault rpc failed') });
          const instance = params?.p_instance_id as string;
          return Promise.resolve({ data: fake.tokens[instance] ?? null, error: null });
        }
        if (name === 'is_admin_or_supervisor') {
          return Promise.resolve({ data: isAdmin, error: null });
        }
        if (name in extraRpcCalls) return Promise.resolve(extraRpcCalls[name]);
        return Promise.resolve({ data: null, error: null });
      },
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: userId } }, error: null }),
      },
      from: (table: string) => builder(fake, table),
    },
  };
}

// ─── Testes de autorização e rate limit (N-162) ──────────────────────────

Deno.test('N-162: Bearer de agente (sem admin/supervisor) recebe 403', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };

  const res = await run(fake, makeUserRequest(AGENT_TOKEN), makeDepsWithUser(fake, 'user-1', false));
  assert(res.status === 403, `esperado 403 para agente, veio ${res.status}`);
});

Deno.test('N-162: Admin com Bearer passa pela autorização', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });

  const res = await run(fake, makeUserRequest(ADMIN_TOKEN), makeDepsWithUser(fake, 'user-admin', true));
  assert(res.status === 200, `esperado 200 para admin, veio ${res.status}`);
});

Deno.test('N-162: Cron com segredo dedicado continua funcionando (sem restrição de papel)', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });

  const res = await run(fake, makeRequest(), makeDeps(fake));
  assert(res.status === 200, `esperado 200 para cron, veio ${res.status}`);
});

Deno.test('N-162: x-cron-secret INVÁLIDO + Bearer sem privilégio continua 403 (não pula a checagem)', async () => {
  // O bypass real: a presença do header, não o segredo. Com o defeito, o gate de
  // papel é pulado (x-cron-secret presente) e um não-admin autenticado passa (200).
  // Com a correção, o segredo é conferido em tempo constante contra o do Vault e,
  // não casando, a chamada segue como USUÁRIO — e o papel é exigido → 403.
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });

  const req = makeUserRequest(AGENT_TOKEN, '10.0.0.77', { 'x-cron-secret': 'segredo-errado-nao-e-o-do-vault' });
  const res = await run(fake, req, makeDepsWithUser(fake, 'user-1', false));

  assert(
    res.status === 403,
    `segredo de cron inválido não pode pular o gate de papel: esperado 403, veio ${res.status}`,
  );
  // E não pode ter consultado o provedor nem transicionado status: barrado antes.
  assert(fake.calls.length === 0, `barrado não deve consultar o provedor: ${JSON.stringify(fake.calls)}`);
});

Deno.test('N-162: limite é por USUÁRIO — mesmo usuário em IPs diferentes é bloqueado com 429', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });

  // Usuário exclusivo deste teste: o contador é em memória e compartilhado na isolate.
  const USER = 'user-rate-por-usuario';

  // As 6 primeiras passam, cada uma de um IP DIFERENTE (o IP não é a chave).
  for (let i = 0; i < 6; i++) {
    const res = await run(fake, makeUserRequest(ADMIN_TOKEN, `10.9.0.${i}`), makeDepsWithUser(fake, USER, true));
    assert(res.status === 200, `requisição ${i + 1} (IP diferente): esperado 200, veio ${res.status}`);
  }
  // A 7ª, de outro IP ainda, é bloqueada: a chave é o usuário, não o IP.
  const res = await run(fake, makeUserRequest(ADMIN_TOKEN, '10.9.0.200'), makeDepsWithUser(fake, USER, true));
  assert(res.status === 429, `esperado 429 na 7ª de IP distinto, veio ${res.status}`);
});

Deno.test('N-162: limite é por USUÁRIO — usuários diferentes no mesmo IP não se bloqueiam', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });

  const IP_COMUM = '10.8.0.1';

  for (let i = 0; i < 6; i++) {
    const res = await run(fake, makeUserRequest(ADMIN_TOKEN, IP_COMUM), makeDepsWithUser(fake, 'user-a-mesmo-ip', true));
    assert(res.status === 200, `user-a requisição ${i + 1}: esperado 200, veio ${res.status}`);
  }
  // Outro usuário no MESMO IP não herda o estouro do primeiro.
  const res = await run(fake, makeUserRequest(ADMIN_TOKEN, IP_COMUM), makeDepsWithUser(fake, 'user-b-mesmo-ip', true));
  assert(res.status === 200, `user-b no mesmo IP não pode ser bloqueado por user-a, veio ${res.status}`);
});

Deno.test('N-162: service key interna continua passando sem exigir papel', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });

  const deps = makeDepsWithUser(fake, 'user-ignorado', false);
  const res = await run(fake, makeUserRequest((deps as { serviceKey: string }).serviceKey), deps);
  assert(res.status === 200, `service key deve passar, veio ${res.status}`);
});

// ---------------------------------------------------------------------------
// SL-053 (retomada): alvo único e concorrência limitada na varredura.
//
// DEFEITO fechado: a sonda SEMPRE varria todas as conexões (uma de cada vez).
// Não havia como o "Verificar agora" de uma instância pedir só a dela, e um
// lote grande prendia a Edge. Agora:
//   - `{ instanceName }` verifica SÓ aquela conexão (e instância de formato
//     inválido é recusada ANTES de virar segmento de PATH/parâmetro de RPC);
//   - instância bem-formada mas desconhecida responde 404 NEUTRO (sem nomear);
//   - sem alvo, a varredura roda com no máximo 3 conexões em voo.
// ---------------------------------------------------------------------------

/** Requisição de cron com corpo JSON (o `run` aceita o Request pronto). */
function makeCronRequestWithBody(body: unknown): Request {
  return new Request('https://edge.test/connection-health-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
    body: JSON.stringify(body),
  });
}

Deno.test('alvo único: verifica SÓ a instância pedida, não varre as demais', async () => {
  const fake = baseFake();
  fake.rows = [
    { id: 'c1', instance_id: 'inst_a', phone_number: null },
    { id: 'c2', instance_id: 'inst_b', phone_number: null },
    { id: 'c3', instance_id: 'inst_c', phone_number: null },
  ];
  fake.statusById = { c1: 'connected', c2: 'connected', c3: 'connected' };
  fake.tokens = { inst_a: 'tok-a', inst_b: 'tok-b', inst_c: 'tok-c' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });

  const res = await run(fake, makeCronRequestWithBody({ instanceName: 'inst_b' }), makeDeps(fake));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);

  // Uma única consulta de estado, e ela é da instância pedida (no flavor GO a
  // instância é identificada pela CREDENCIAL, então o alvo aparece no apikey).
  // (A camada de identidade/owner faz uma chamada ADMIN à parte — não entra
  // nesta contagem; ela nunca carrega credencial de outra instância.)
  const stateCalls = fake.calls.filter((c) => c.path.includes('/instance/status'));
  assert(stateCalls.length === 1, `esperado 1 consulta de estado (só o alvo), recebido ${stateCalls.length}`);
  assert(
    stateCalls[0].apikey === 'tok-b',
    `a consulta tem de ser da instância pedida (token do alvo): ${JSON.stringify(stateCalls)}`,
  );
  assert(
    !fake.calls.some((c) => c.apikey === 'tok-a' || c.apikey === 'tok-c'),
    `nenhuma chamada pode levar credencial de outra instância: ${JSON.stringify(fake.calls)}`,
  );
  // Só a instância pedida foi logada/atualizada; as outras não foram tocadas.
  const logadas = fake.healthLogs.map((l) => l.instance_id);
  assert(
    JSON.stringify(logadas) === JSON.stringify(['inst_b']),
    `só o alvo pode ser registrado: ${JSON.stringify(logadas)}`,
  );
});

Deno.test('alvo único desconhecido: 404 neutro, sem rede e sem vazar o nome', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'inst-a', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-a': 'tok-a' };

  const res = await run(fake, makeCronRequestWithBody({ instanceName: 'inexistente' }), makeDeps(fake));
  assert(res.status === 404, `esperado 404 neutro, recebido ${res.status}`);
  assert(fake.calls.length === 0, `não pode consultar o provedor: ${JSON.stringify(fake.calls)}`);
  assert(
    !fake.rpcCalls.includes('get_instance_token'),
    `não pode buscar credencial de instância inexistente: ${JSON.stringify(fake.rpcCalls)}`,
  );
});

Deno.test('alvo com formato inválido: recusa ANTES da rede e sem refletir o valor', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'inst-a', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-a': 'tok-a' };

  // `../` e maiúsculas não passam na regex do cadastro de instância.
  const res = await run(fake, makeCronRequestWithBody({ instanceName: '../ETC/passwd' }), makeDeps(fake));
  assert(res.status === 400, `esperado 400 para formato inválido, recebido ${res.status}`);
  assert(fake.calls.length === 0, `não pode tocar a rede: ${JSON.stringify(fake.calls)}`);
  assert(
    !fake.rpcCalls.includes('get_instance_token'),
    `não pode passar id inválido à RPC: ${JSON.stringify(fake.rpcCalls)}`,
  );
  const corpo = await res.text();
  assert(
    !corpo.includes('../ETC/passwd'),
    `a resposta não pode refletir o valor recebido: ${corpo}`,
  );
});

Deno.test('sem alvo: varredura com concorrência LIMITADA (no máximo 3 em voo)', async () => {
  const fake = baseFake();
  // 7 instâncias válidas, cada uma com o seu token (sem token não haveria rede).
  fake.rows = Array.from({ length: 7 }, (_, i) => ({
    id: `c${i + 1}`,
    instance_id: `inst_${i + 1}`,
    phone_number: null,
  }));
  fake.statusById = Object.fromEntries(fake.rows.map((r, i) => [r.id, 'connected']));
  fake.tokens = Object.fromEntries(fake.rows.map((r, i) => [r.instance_id, `tok-${i + 1}`]));

  let emVoo = 0;
  let pico = 0;
  fake.fetchImpl = async () => {
    emVoo++;
    pico = Math.max(pico, emVoo);
    await new Promise((r) => setTimeout(r, 5));
    emVoo--;
    return jsonResponse({ instance: { state: 'open' } });
  };

  const res = await run(fake, makeRequest(), makeDeps(fake));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);

  // 7 consultas de ESTADO (uma por instância). A camada de identidade/owner faz
  // uma chamada ADMIN à parte por conexão — não entra nesta contagem.
  const stateCalls = fake.calls.filter((c) => c.path.includes('/instance/status'));
  assert(stateCalls.length === 7, `todas as 7 instâncias têm de ser consultadas: ${stateCalls.length}`);
  assert(pico === 3, `pico de concorrência deve ser exatamente 3, foi ${pico}`);
  assert(emVoo === 0, `nenhuma consulta pode ficar pendente: ${emVoo}`);

  // A resposta traz o resultado por conexão na ordem da consulta + o instante.
  const corpo = await res.json() as { checked_at?: string; connections?: Array<{ instance_id: string }> };
  assert(typeof corpo.checked_at === 'string' && corpo.checked_at.length > 0, `faltou checked_at: ${JSON.stringify(corpo)}`);
  assert(
    JSON.stringify(corpo.connections?.map((c) => c.instance_id)) ===
      JSON.stringify(fake.rows.map((r) => r.instance_id)),
    `resultado por conexão fora de ordem: ${JSON.stringify(corpo.connections)}`,
  );
});

// ---------------------------------------------------------------------------
// R2-CONEX (paridade V3→V2, rodada 2): camadas 2/3 da avaliação, degrau de
// leitura, caixa muda (PE-87), opt-in/e-mail fail-closed e espelho do CI.
//
// O degrau lê nomes que EXISTEM no V2 (`notifications`, `profiles`,
// `is_within_business_hours`); `app_notifications` e
// `connection_alert_preferences` NÃO existem — o teste do espelho testemunha
// isso pelo comportamento (nenhum insert nessas tabelas, nenhum rpc de
// preferência) e o guard `supabase-usage-guard` prova o resto no CI.
// ---------------------------------------------------------------------------

Deno.test('R2 degrau (unidade): fantasma/abandonada → disconnected; webhook parado → degraded; nova → healthy', () => {
  const agora = new Date('2026-10-16T12:00:00.000Z');

  // O ramo fantasma existe no contrato (na prática o provedor nunca devolve
  // known+null — por isso o caminho de handler é defensivo e este ramo é
  // coberto aqui, no nível da função pura).
  const fantasma = evaluateOpenConnectionHealth({
    owner: { known: true, ownerJid: null },
    lastActivityAt: null,
    now: agora,
  });
  assert(
    fantasma.healthStatus === 'disconnected' && fantasma.dbStatus === 'disconnected' &&
      fantasma.reason === 'phantom_session',
    `fantasma tem de derrubar para disconnected: ${JSON.stringify(fantasma)}`,
  );

  const abandonada = evaluateOpenConnectionHealth({
    owner: { known: false, ownerJid: null },
    lastActivityAt: new Date(agora.getTime() - 7 * 3600_000),
    now: agora,
  });
  assert(
    abandonada.healthStatus === 'disconnected' && abandonada.dbStatus === 'disconnected' &&
      abandonada.reason === 'stale_session',
    `abandonada há 7h tem de derrubar: ${JSON.stringify(abandonada)}`,
  );

  const muda = evaluateOpenConnectionHealth({
    owner: { known: true, ownerJid: '5511999999999@s.whatsapp.net' },
    lastActivityAt: new Date(agora.getTime() - 45 * 60_000),
    now: agora,
  });
  assert(
    muda.healthStatus === 'degraded' && muda.dbStatus === 'connected' && muda.reason === 'webhook_silent',
    `webhook parado há 45min é degraded SEM derrubar o status: ${JSON.stringify(muda)}`,
  );

  const nova = evaluateOpenConnectionHealth({
    owner: { known: false, ownerJid: null },
    lastActivityAt: null,
    now: agora,
  });
  assert(
    nova.healthStatus === 'healthy' && nova.dbStatus === 'connected' && nova.reason === null,
    `conexão nova sem histórico nunca vira inativa: ${JSON.stringify(nova)}`,
  );
});

Deno.test('R2 degrau (unidade): parseOwnerJid entende v2 e v3; vazio é desconhecido', () => {
  const v2 = parseOwnerJid([{ instanceName: 'a', ownerJid: '5511@s.whatsapp.net' }]);
  assert(v2.known && v2.ownerJid === '5511@s.whatsapp.net', `formato v2: ${JSON.stringify(v2)}`);
  const v3 = parseOwnerJid({ instance: { owner: '5522@s.whatsapp.net' } });
  assert(v3.known && v3.ownerJid === '5522@s.whatsapp.net', `formato v3: ${JSON.stringify(v3)}`);
  const semDono = parseOwnerJid({ instance: { state: 'open' } });
  assert(!semDono.known && semDono.ownerJid === null, `sem dono é desconhecido: ${JSON.stringify(semDono)}`);
  const listaVazia = parseOwnerJid([]);
  assert(!listaVazia.known && listaVazia.ownerJid === null, `lista vazia é desconhecida: ${JSON.stringify(listaVazia)}`);
});

Deno.test('R2 caixa muda (unidade): limiar fora da faixa volta ao padrão; chave estável por conexão', () => {
  assert(parseSilenceMinutes(60) === 60, 'valor válido passa');
  assert(parseSilenceMinutes('15') === 15, 'texto numérico passa');
  assert(parseSilenceMinutes(0) === 10, 'zero volta ao padrão de 10min');
  assert(parseSilenceMinutes(2000) === 10, 'acima de 24h volta ao padrão');
  assert(parseSilenceMinutes('abc') === 10, 'texto inválido volta ao padrão');
  assert(parseSilenceMinutes(null) === 10, 'ausente volta ao padrão');
  assert(
    inboxSilenceDedupeKey('c1') === 'inbox-silent:v1:c1' && inboxSilenceDedupeKey('c1') === inboxSilenceDedupeKey('c1'),
    'chave estável por conexão',
  );
  assert(inboxSilenceDedupeKey('c1') !== inboxSilenceDedupeKey('c2'), 'conexões distintas, chaves distintas');
});

function r2Conn(id: string, instance: string): ConnRow {
  return { id, instance_id: instance, phone_number: null };
}

Deno.test('R2 camada 3 (handler): sessão abandonada há 7h derruba para disconnected com alerta critical', async () => {
  const fake = baseFake();
  fake.rows = [r2Conn('c1', 'inst-c1')];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-c1': 'tok-c1' };
  fake.lastInbound = [{ created_at: new Date(Date.now() - 7 * 3600_000).toISOString() }];
  fake.withinHours = false;

  const res = await run(fake, makeRequest(), makeDeps(fake));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(
    fake.healthLogs.length === 1 && fake.healthLogs[0].status === 'disconnected',
    `log tem de registrar a queda: ${JSON.stringify(fake.healthLogs)}`,
  );
  const quedas = fake.alerts.filter((a) => String(a.dedupe_key) === 'conn-down:v1:c1');
  assert(
    quedas.length === 1 && quedas[0].alert_type === 'critical',
    `queda gera UM alerta critical de sessão abandonada: ${JSON.stringify(fake.alerts)}`,
  );
  // O motivo do degrau (stale_session) viaja na resposta, não na linha da warroom.
  const corpoQueda = await res.json() as { connections?: Array<{ reason?: string }> };
  assert(
    corpoQueda.connections?.[0]?.reason === 'stale_session',
    `resposta tem de carregar reason=stale_session: ${JSON.stringify(corpoQueda)}`,
  );
  assert(fake.statusById['c1'] === 'disconnected', 'o CAS aplica a queda no status');
  // Fail-closed: sem opt-ins, nada de push nem e-mail.
  assert(fake.pushNotifications.length === 0, 'sem opt-in não há push');
  assert(!fake.calls.some((c) => c.path.includes('/emails')), 'sem opt-in o Resend não é chamado');
});

Deno.test('R2 camada 3 (handler): webhook parado gera UM alerta warning e não derruba o status', async () => {
  const fake = baseFake();
  fake.rows = [r2Conn('c1', 'inst-c1')];
  fake.statusById = { c1: 'connecting' };
  fake.tokens = { 'inst-c1': 'tok-c1' };
  fake.lastInbound = [{ created_at: new Date(Date.now() - 45 * 60_000).toISOString() }];
  fake.withinHours = false;

  await run(fake, makeRequest(), makeDeps(fake)); // 1ª detecção
  await run(fake, makeRequest(), makeDeps(fake)); // 2ª detecção do mesmo episódio

  assert(
    fake.healthLogs.length === 2 && fake.healthLogs[0].status === 'degraded',
    `primeira detecção é degraded: ${JSON.stringify(fake.healthLogs)}`,
  );
  const avisos = fake.alerts.filter((a) => String(a.dedupe_key) === 'conn-degraded:v1:c1');
  assert(
    avisos.length === 1,
    `duas detecções do mesmo episódio produzem UM alerta, recebido ${avisos.length}: ${JSON.stringify(fake.alerts)}`,
  );
  assert(
    avisos[0].alert_type === 'warning',
    `alerta é warning de webhook parado: ${JSON.stringify(avisos[0])}`,
  );
  assert(fake.statusById['c1'] === 'connected', 'degraded não derruba o status da conexão');
  assert(fake.pushNotifications.length === 0, 'sem opt-in não há push');
  assert(!fake.calls.some((c) => c.path.includes('/emails')), 'sem opt-in não há e-mail');
});

Deno.test('R2 caixa muda (handler): silêncio além do limiar alerta; mensagem nova auto-resolve', async () => {
  const fake = baseFake();
  fake.rows = [r2Conn('c1', 'inst-c1')];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-c1': 'tok-c1' };
  fake.lastInbound = [{ created_at: new Date(Date.now() - 20 * 60_000).toISOString() }];
  fake.withinHours = true;

  await run(fake, makeRequest(), makeDeps(fake));
  const mudas = fake.alerts.filter((a) => String(a.dedupe_key) === 'inbox-silent:v1:c1');
  assert(
    mudas.length === 1 && mudas[0].alert_type === 'warning',
    `silêncio de 20min (limiar 10min) alerta: ${JSON.stringify(fake.alerts)}`,
  );
  assert(
    fake.pushNotifications.length === 0 && !fake.calls.some((c) => c.path.includes('/emails')),
    'caixa muda sem opt-in não dispara push nem e-mail',
  );

  // Mensagem nova resolve sozinha.
  fake.lastInbound = [{ created_at: new Date().toISOString() }];
  await run(fake, makeRequest(), makeDeps(fake));
  assert(
    fake.alertDeletes.some((fs) =>
      (fs as Array<[string, string]>).some(([c, v]) => c === 'dedupe_key' && v === 'inbox-silent:v1:c1')
    ),
    `mensagem nova tem de auto-resolver o alerta: ${JSON.stringify(fake.alertDeletes)}`,
  );
});

Deno.test('R2 espelho (handler): alerta usa tabelas reais; inexistentes nunca são tocadas', async () => {
  const fake = baseFake();
  fake.rows = [r2Conn('c1', 'inst-c1')];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-c1': 'tok-c1' };
  fake.lastInbound = [{ created_at: new Date(Date.now() - 7 * 3600_000).toISOString() }];
  fake.withinHours = false;

  const res = await run(fake, makeRequest(), makeDeps(fake));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  // Positivo: o pipeline do alerta escreve onde o V2 tem tabela.
  assert(fake.insertTables.includes('warroom_alerts'), `alerta vai à warroom: ${JSON.stringify(fake.insertTables)}`);
  assert(
    fake.insertTables.includes('connection_health_logs'),
    `log vai à connection_health_logs: ${JSON.stringify(fake.insertTables)}`,
  );
  // Negativo (o motivo da recusa 1): os nomes que quebraram o guard não existem.
  assert(
    !fake.insertTables.includes('app_notifications'),
    `tabela inexistente não pode receber insert: ${JSON.stringify(fake.insertTables)}`,
  );
  assert(
    !fake.rpcCalls.some((n) => n.includes('preference')),
    `nenhum rpc de preferência (tabela ainda não existe): ${JSON.stringify(fake.rpcCalls)}`,
  );
});
