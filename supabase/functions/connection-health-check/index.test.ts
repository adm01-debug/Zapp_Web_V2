import {
  handleConnectionHealthCheck,
  evaluateOpenConnectionHealth,
  parseOwnerJid,
  parseSilenceMinutes,
  inboxSilenceDedupeKey,
} from './index.ts';

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
  /** corpos crus das chamadas de rede (para inspecionar o e-mail do Resend) */
  bodies: string[];
  /** última mensagem recebida devolvida por messages (camada 3 / caixa muda) */
  lastInbound: Array<{ created_at: string }>;
  /** linhas de opt-in por canal/tipo (formato da loja `connection_alert_preferences`
   * da V3 — tabela ainda inexistente no schema V2; o handler NÃO consulta, e o
   * mock serve as linhas só para provar o fail-closed sem loja) */
  prefs: Array<Record<string, unknown>>;
  /** admins (id + email) para o fan-out de e-mail */
  adminProfiles: Array<{ id: string; email: string }>;
  /** pushes gravados em notifications (a tabela real da V2) */
  appNotifications: Array<unknown>;
  /** deletes em warroom_alerts (auto-resolve), com os filtros aplicados */
  alertDeletes: Array<Array<[string, string]>>;
  /** resposta de is_within_business_hours */
  withinHours: boolean;
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
    bodies: [],
    lastInbound: [],
    prefs: [],
    adminProfiles: [],
    appNotifications: [],
    alertDeletes: [],
    withinHours: false,
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
  if (op === 'select' && table === 'messages') {
    return { data: fake.lastInbound[0] ?? null, error: null };
  }
  if (op === 'select' && table === 'connection_alert_preferences') {
    // A loja não existe no schema V2: o handler não consulta (fail-closed).
    // O mock serve as linhas do formato para provar que, mesmo COM opt-ins
    // cadastrados, nada é enviado sem a tabela real.
    return { data: fake.prefs, error: null };
  }
  if (op === 'select' && table === 'profiles') {
    return { data: fake.adminProfiles, error: null };
  }
  if (op === 'insert' && table === 'notifications' && pending) {
    fake.appNotifications.push(pending);
    return { data: null, error: null };
  }
  if (op === 'delete' && table === 'warroom_alerts') {
    fake.alertDeletes.push(filters);
    return { data: null, error: null };
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
    const body = init?.body ? String(init.body) : null;
    if (body) fake.bodies.push(body);
    fake.calls.push({ path, apikey });
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

  // No flavor GO a instância é escolhida pela CREDENCIAL, então cada conexão
  // consulta o estado com o token dela. A checagem de identidade (ownerJid) usa a
  // rota GLOBAL de listagem de instâncias (mesma credencial global da V3) — por isso
  // a asserção de "nunca a chave global" fica restrita às chamadas de ESTADO.
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
  assert(
    !stateCalls.some((c) => c.apikey === 'test-evolution-key' || c.apikey === 'tok-legado-da-padrao'),
    `a credencial global/legada não pode ser usada numa rota de instância: ${JSON.stringify(stateCalls)}`,
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

// ─────────────── paridade V3: 3 camadas, preferências e caixa muda ───────────────

Deno.test('3 camadas (V3): phantom_session, stale_session, webhook_silent e healthy', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const ok = '5511999999999@s.whatsapp.net';

  const phantom = evaluateOpenConnectionHealth({ owner: { known: true, ownerJid: null }, lastActivityAt: null, now });
  assert(
    phantom.healthStatus === 'degraded' && phantom.dbStatus === 'disconnected' && phantom.reason === 'phantom_session',
    `socket aberto sem número pareado deve ser phantom_session: ${JSON.stringify(phantom)}`,
  );

  const stale = evaluateOpenConnectionHealth({
    owner: { known: true, ownerJid: ok },
    lastActivityAt: new Date(now.getTime() - 7 * 60 * 60 * 1000),
    now,
  });
  assert(
    stale.healthStatus === 'disconnected' && stale.dbStatus === 'disconnected' && stale.reason === 'stale_session',
    `7 h sem entrada deve ser stale_session: ${JSON.stringify(stale)}`,
  );

  const silent = evaluateOpenConnectionHealth({
    owner: { known: true, ownerJid: ok },
    lastActivityAt: new Date(now.getTime() - 45 * 60 * 1000),
    now,
  });
  assert(
    silent.healthStatus === 'degraded' && silent.dbStatus === 'connected' && silent.reason === 'webhook_silent',
    `45 min sem entrada deve ser webhook_silent: ${JSON.stringify(silent)}`,
  );

  const fresh = evaluateOpenConnectionHealth({
    owner: { known: true, ownerJid: ok },
    lastActivityAt: new Date(now.getTime() - 5 * 60 * 1000),
    now,
  });
  assert(
    fresh.healthStatus === 'healthy' && fresh.dbStatus === 'connected' && fresh.reason === null,
    `5 min de atividade é healthy: ${JSON.stringify(fresh)}`,
  );

  // Bordas exatas dos limiares (não podem "cair" para o lado errado).
  const exato30 = evaluateOpenConnectionHealth({
    owner: { known: true, ownerJid: ok }, lastActivityAt: new Date(now.getTime() - 30 * 60 * 1000), now,
  });
  assert(exato30.healthStatus === 'healthy', `exatamente 30 min ainda é healthy: ${JSON.stringify(exato30)}`);
  const exato6h = evaluateOpenConnectionHealth({
    owner: { known: true, ownerJid: ok }, lastActivityAt: new Date(now.getTime() - 6 * 60 * 60 * 1000), now,
  });
  assert(exato6h.healthStatus === 'degraded' && exato6h.reason === 'webhook_silent', `exatamente 6 h ainda é degradada: ${JSON.stringify(exato6h)}`);

  // Sem mensagem alguma conhecida não rebaixa (evita alerta falso em conexão nova).
  const semMensagem = evaluateOpenConnectionHealth({ owner: { known: true, ownerJid: ok }, lastActivityAt: null, now });
  assert(semMensagem.healthStatus === 'healthy', `sem mensagem não rebaixa: ${JSON.stringify(semMensagem)}`);

  // Identidade desconhecida (rota sem resposta de identidade) NÃO vira fantasma.
  const semIdentidade = evaluateOpenConnectionHealth({
    owner: { known: false, ownerJid: null }, lastActivityAt: null, now,
  });
  assert(semIdentidade.reason === null && semIdentidade.healthStatus === 'healthy', `owner desconhecido não é fantasma: ${JSON.stringify(semIdentidade)}`);
});

Deno.test('parseOwnerJid: array/objeto v2/v3 e resposta sem identidade', () => {
  assert(
    parseOwnerJid([{ instance: { ownerJid: 'a@s' } }]).ownerJid === 'a@s',
    'array (v2) com instance.ownerJid',
  );
  const objeto = parseOwnerJid({ owner: 'b@s' });
  assert(objeto.known && objeto.ownerJid === 'b@s', 'objeto com owner na raiz');
  const vazio = parseOwnerJid({ instance: { state: 'open' } });
  assert(!vazio.known && vazio.ownerJid === null, 'sem campo de identidade ⇒ known=false (camada pulada)');
  const nulo = parseOwnerJid(null);
  assert(!nulo.known, 'null ⇒ known=false');
  // Identidade presente mas sem número pareado ⇒ known=true e ownerJid null (fantasma).
  const fantasma = parseOwnerJid({ instance: { connectionStatus: 'open' } });
  assert(fantasma.known && fantasma.ownerJid === null, 'identidade sem número ⇒ known=true, ownerJid=null');
});

Deno.test('parseSilenceMinutes: faixa 1..1440 com o padrão 10', () => {
  assert(parseSilenceMinutes('15') === 15, 'string numérica');
  assert(parseSilenceMinutes(30) === 30, 'número');
  assert(parseSilenceMinutes('0') === 10, 'abaixo do mínimo cai no padrão');
  assert(parseSilenceMinutes('9999') === 10, 'acima do máximo cai no padrão');
  assert(parseSilenceMinutes(undefined) === 10, 'ausente cai no padrão');
  assert(parseSilenceMinutes('abc') === 10, 'não numérico cai no padrão');
  assert(parseSilenceMinutes(1440) === 1440 && parseSilenceMinutes(1) === 1, 'limites inclusos');
});

Deno.test('inboxSilenceDedupeKey: chave estável por conexão', () => {
  assert(inboxSilenceDedupeKey('c1') === 'inbox-silent:v1:c1', 'chave do episódio');
});

Deno.test('preferências: sem a loja no schema V2, o alerta dispara e push/e-mail ficam retidos (fail-closed)', async () => {
  // A loja `connection_alert_preferences` só existe na V3. Mesmo COM linhas de
  // opt-in no formato da loja, o handler V2 não consulta tabela inexistente:
  // o alerta da queda é criado e nada é enviado (sem spam, sem push fantasma).
  Deno.env.set('RESEND_API_KEY', 'test-resend-key');
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'inst-b', phone_number: '5511999' }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-b': 'tok-inst-b' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'close' } }); // queda ⇒ alerta desconectada
  fake.prefs = [
    { user_id: 'u-email', email_enabled: true, push_enabled: false, alert_on_disconnected: true },
    { user_id: 'u-push', push_enabled: true, email_enabled: false, alert_on_disconnected: true },
    { user_id: 'u-off', push_enabled: true, email_enabled: true, alert_on_disconnected: false },
  ];
  fake.adminProfiles = [
    { id: 'u-email', email: 'email@ex.com' },
    { id: 'u-push', email: 'push@ex.com' },
    { id: 'u-off', email: 'off@ex.com' },
  ];

  const res = await run(fake);
  assert(res.status === 200, `esperado 200, veio ${res.status}`);

  // O alerta da queda continua sendo criado (a warroom é a vitrine do monitor).
  const alerts = fake.alerts.filter((a) => a.source === 'connection-health-check');
  assert(alerts.length === 1, `uma queda = um alerta: ${JSON.stringify(fake.alerts)}`);

  // Sem a loja no schema, nenhum push é gravado — nem em `notifications`.
  assert(fake.appNotifications.length === 0, `sem loja não há push: ${JSON.stringify(fake.appNotifications)}`);

  // ...e nenhum e-mail sai, mesmo com opt-ins no formato da loja.
  const resend = fake.bodies.filter((b) => b.includes('"to"'));
  assert(resend.length === 0, `sem loja não há e-mail: ${JSON.stringify(fake.bodies)}`);
});

Deno.test('caixa muda (PE-87): sem mensagem recebida no horário comercial ⇒ alerta idempotente', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'inst-b', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-b': 'tok-inst-b' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open', ownerJid: '5511@s.whatsapp.net' } });
  fake.withinHours = true;
  fake.lastInbound = []; // nenhuma mensagem recebida

  const res = await run(fake);
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  const silencioso = fake.alerts.filter((a) => a.dedupe_key === 'inbox-silent:v1:c1');
  assert(silencioso.length === 1, `um alerta de caixa muda: ${JSON.stringify(fake.alerts)}`);
  assert(silencioso[0].source === 'connection-health-check', 'origem do alerta');
  // Conexão saudável ⇒ nenhum alerta de queda junto.
  assert(!fake.alerts.some((a) => a.dedupe_key === 'conn-down:v1:c1'), 'não pode marcar queda');
});

Deno.test('caixa muda (PE-87): fora do horário comercial não alerta nem resolve', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'inst-b', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-b': 'tok-inst-b' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open', ownerJid: '5511@s.whatsapp.net' } });
  fake.withinHours = false;
  fake.lastInbound = [];

  const res = await run(fake);
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(!fake.alerts.some((a) => a.dedupe_key === 'inbox-silent:v1:c1'), `fora do horário não alerta: ${JSON.stringify(fake.alerts)}`);
  assert(fake.alertDeletes.length === 0, `fora do horário não resolve: ${JSON.stringify(fake.alertDeletes)}`);
});

Deno.test('caixa muda (PE-87): mensagem voltou ⇒ auto-resolve do episódio', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'inst-b', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-b': 'tok-inst-b' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open', ownerJid: '5511@s.whatsapp.net' } });
  fake.withinHours = true;
  fake.lastInbound = [{ created_at: new Date().toISOString() }]; // recebeu agora

  const res = await run(fake);
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(!fake.alerts.some((a) => a.dedupe_key === 'inbox-silent:v1:c1'), `não alerta com mensagem recente: ${JSON.stringify(fake.alerts)}`);
  const resolveu = fake.alertDeletes.some((f) => f.some(([c, v]) => c === 'dedupe_key' && v === 'inbox-silent:v1:c1'));
  assert(resolveu, `o alerta do episódio deve ser removido: ${JSON.stringify(fake.alertDeletes)}`);
});
