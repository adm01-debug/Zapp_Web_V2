import { handleConnectionHealthCheck, decideReconnect, RECONNECT_EXHAUSTED_REASON, PHANTOM_SESSION_REASON, CONFIRMED_DOWN_REASON, evaluateOpenConnectionHealth, parseOwnerJid, parseSilenceMinutes, inboxSilenceDedupeKey, buildConnectionAlertPrefs, decideEscalation, levelDedupeKey } from './index.ts';

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
  retry_count?: number;
  auto_reconnect_enabled?: boolean;
  reconnect_max_attempts?: number;
  reconnect_interval_seconds?: number;
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
  /** deletes restantes no warroom; alertas resolvidos devem usar UPDATE */
  alertDeletes: Array<unknown>;
  /** atualizações do warroom (testemunha da preservação do histórico) */
  alertUpdates: Array<{ filters: Array<[string, string]>; payload: Row }>;
  /** dentro do horário comercial? (RPC is_within_business_hours) */
  withinHours: boolean;
  /** get_instance_token falha (leitura do Vault indisponível) */
  tokenRpcError: boolean;
  alerts: Array<Record<string, unknown>>;
  healthLogs: Array<Record<string, unknown>>;
  /** linhas que o handler grava em `audit_logs` (trilha de transição de status) */
  auditLogs: Array<Record<string, unknown>>;
  connUpdates: Array<Record<string, unknown>>;
  /** tabelas alvo de CADA insert (testemunha do espelho: push vai a `notifications`) */
  insertTables: string[];
  calls: Array<{ path: string; apikey: string | null }>;
  rpcCalls: string[];
  /** papéis (user_roles) — destinatários obrigatórios da escalada */
  roleRows: Array<{ user_id: string; role: string }>;
  /** created_at do alerta de warroom aberto (início do episódio) */
  episodeStartedAt: string | null;
  /** campanhas pausadas por connection_lost na conexão (talkx_campaigns) */
  pausedCampaigns: Array<{ id: string }>;
  /** Resend recusa (500) quando true */
  resendDown: boolean;
  /** connection_alert_preferences (cartão "Alertas de Conexão") */
  prefRows: Array<Record<string, unknown>>;
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
    alertUpdates: [],
    withinHours: false,
    alerts: [],
    healthLogs: [],
    auditLogs: [],
    connUpdates: [],
    insertTables: [],
    calls: [],
    rpcCalls: [],
    roleRows: [],
    episodeStartedAt: null,
    pausedCampaigns: [],
    resendDown: false,
    prefRows: [],
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
  likePattern = '',
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
  if (table === 'reconnection_logs' && op === 'insert' && pending) {
    fake.insertTables.push(table);
    fake.auditLogs.push({ __reconnect: true, ...pending });
    return { data: null, error: null };
  }
  if (table === 'audit_logs' && op === 'insert' && pending) {
    fake.auditLogs.push(pending);
    return { data: null, error: null };
  }
  if (table === 'warroom_alerts' && op === 'insert' && pending) {
    fake.insertTables.push(table);
    fake.alerts.push(pending);
    return { data: null, error: null };
  }
  if (table === 'warroom_alerts' && op === 'update' && pending) {
    fake.alertUpdates.push({ filters, payload: pending });
    const keyFilter = filters.find(([column]) => column === 'dedupe_key')?.[1];
    let keys: string[] = [];
    if (keyFilter) {
      try {
        const decoded: unknown = JSON.parse(keyFilter);
        keys = Array.isArray(decoded) ? decoded.map(String) : [keyFilter];
      } catch {
        keys = [keyFilter];
      }
    }
    for (const alert of fake.alerts) {
      if (keys.includes(String(alert.dedupe_key))) Object.assign(alert, pending);
    }
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
    // ux_notifications_user_dedupe_key: (user_id, dedupe_key) único quando a chave existe.
    const dup = pending.dedupe_key && fake.pushNotifications.some((n) => {
      const r = n as Row;
      return r.user_id === pending.user_id && r.dedupe_key === pending.dedupe_key;
    });
    if (dup) return { data: null, error: { code: '23505', message: 'duplicate' } };
    fake.insertTables.push(table);
    fake.pushNotifications.push(pending);
    return { data: null, error: null };
  }
  if (table === 'notifications' && op === 'select') {
    const u = filters.find(([c]) => c === 'user_id')?.[1];
    const k = filters.find(([c]) => c === 'dedupe_key')?.[1];
    const hit = fake.pushNotifications.find((n) => (n as Row).user_id === u && (n as Row).dedupe_key === k);
    return { data: hit ? { id: 'n' } : null, error: null };
  }
  if (table === 'connection_alert_preferences' && op === 'select') {
    return { data: fake.prefRows, error: null };
  }
  if (table === 'talkx_campaigns' && op === 'select') {
    return { data: fake.pausedCampaigns, error: null };
  }
  if (table === 'notifications' && op === 'update' && pending) {
    const pattern = likePattern ? new RegExp('^' + likePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$') : null;
    for (const n of fake.pushNotifications) {
      if (!pattern || pattern.test(String((n as Row).dedupe_key))) Object.assign(n as Row, pending);
    }
    return { data: null, error: null };
  }
  if (table === 'user_roles' && op === 'select') {
    const roleFilter = filters.find(([c]) => c === 'role')?.[1];
    const allowed: string[] | null = roleFilter ? JSON.parse(roleFilter) : null;
    return { data: fake.roleRows.filter((r) => !allowed || allowed.includes(r.role)), error: null };
  }
  if (table === 'warroom_alerts' && op === 'select') {
    if (fake.episodeStartedAt) return { data: { created_at: fake.episodeStartedAt }, error: null };
    const k = filters.find(([c]) => c === 'dedupe_key')?.[1];
    const aberto = fake.alerts.find((a) => a.dedupe_key === k);
    return { data: aberto ? { created_at: String(aberto.created_at ?? new Date().toISOString()) } : null, error: null };
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
  let likePattern = '';
  self.like = (_c: string, v: string) => {
    likePattern = v;
    return self;
  };
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
  self.in = (c: string, v: readonly unknown[]) => {
    filters.push([c, JSON.stringify(v)]);
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
  const done = () => Promise.resolve(result(fake, table, op, pending, filters, orExpr, likePattern));
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
        if (name === 'transition_talkx_campaign') {
          fake.rpcCalls.push(`transition:${String(params?.p_campaign_id)}:${String(params?.p_action)}`);
          return Promise.resolve({ data: null, error: null });
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
  assert(alertas[0].alert_type === 'critical', 'queda deve gerar alerta crítico');
  assert(alertas[0].title === 'WhatsApp padrao desconectado', `título inesperado: ${String(alertas[0].title)}`);
  assert(String(alertas[0].message).includes('perdeu conexão'), 'mensagem da queda deve explicar a desconexão');
  assert(alertas[0].dedupe_key === 'conn-down:v1:c1', `chave de dedupe inesperada: ${String(alertas[0].dedupe_key)}`);
  const paraDisconnected = fake.connUpdates.filter((u) => u.status === 'disconnected');
  assert(
    paraDisconnected.length === 1,
    `o CAS pelo status lido só pode transicionar uma vez: ${JSON.stringify(fake.connUpdates)}`,
  );
});

Deno.test('E26: recovery preserva alerta e permite reutilizar a chave na próxima queda', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'close' } });

  await run(fake);
  const firstAlert = fake.alerts[0];
  assert(firstAlert?.dedupe_key === 'conn-down:v1:c1', 'primeira queda deve manter a chave ativa');

  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });
  await run(fake);
  assert([...fake.alerts].length === 1, 'recovery deve preservar a linha histórica, não apagá-la');
  assert(firstAlert.dedupe_key === null, 'recovery deve limpar somente a chave de dedupe');
  assert(fake.alertUpdates.some(({ payload }) => payload.dedupe_key === null), 'recovery deve usar UPDATE');
  assert(fake.alertDeletes.length === 0, 'recovery não deve deletar alertas');

  fake.fetchImpl = () => jsonResponse({ instance: { state: 'close' } });
  await run(fake);
  assert([...fake.alerts].length === 2, 'nova queda deve inserir alerta sem apagar o anterior');
  assert(fake.alerts[1].dedupe_key === 'conn-down:v1:c1', 'nova queda deve reutilizar a chave liberada');
});

Deno.test('PE-87: fim do silêncio limpa a chave e preserva o alerta histórico', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.withinHours = true;
  fake.lastInbound = [{ created_at: new Date().toISOString() }];
  fake.alerts = [{
    alert_type: 'warning',
    title: 'Caixa sem mensagens — padrao',
    source: 'connection-health-check',
    dedupe_key: inboxSilenceDedupeKey('c1'),
  }];

  await run(fake);

  assert(fake.alerts.length === 1, 'auto-resolve deve preservar a linha histórica');
  assert(fake.alerts[0].dedupe_key === null, 'mensagem recebida deve liberar a chave de dedupe');
  assert(fake.alertUpdates.some(({ payload }) => payload.dedupe_key === null), 'auto-resolve deve usar UPDATE');
  assert(fake.alertDeletes.length === 0, 'auto-resolve não deve deletar alertas');
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

// ──────────────────────── CA2: trilha de auditoria ─────────────────────────

Deno.test('CA2: queda detectada pelo monitor grava a transição em audit_logs, no formato que o diálogo lê', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'inst-a', phone_number: '+5511999999999' }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { 'inst-a': 'tok-da-inst-a' };
  // Provedor responde 'close' → o monitor transiciona a linha para 'disconnected'.
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'close' } });

  // Duas checagens iguais da MESMA queda: o CAS só deixa transicionar uma vez.
  await run(fake);
  await run(fake);

  assert(fake.auditLogs.length === 1, `esperado 1 evento de trilha para uma única transição, veio ${fake.auditLogs.length}`);
  const ev = fake.auditLogs[0];
  assert(ev.action === 'connection_disconnected', `ação inesperada: ${String(ev.action)}`);
  assert(ev.entity_type === 'connection', `entity_type inesperado: ${String(ev.entity_type)}`);
  assert(ev.entity_id === 'c1', `entity_id deve ser o uuid da linha: ${String(ev.entity_id)}`);
  assert(ev.user_id === null, 'transição automática não tem autor — user_id nulo (a tela mostra "Sistema")');
  const details = ev.details as Record<string, unknown>;
  // O diálogo de auditoria filtra por details.instance_id: sem ele a linha não aparece.
  assert(details.instance_id === 'inst-a', `details.instance_id deve ser o da conexão: ${String(details.instance_id)}`);
  assert(details.previous_status === 'connected', `previous_status inesperado: ${String(details.previous_status)}`);
  assert(details.status === 'disconnected', `status inesperado: ${String(details.status)}`);
  assert(details.source === 'health-check', `origem inesperada: ${String(details.source)}`);
  // Sem telefone, token nem payload bruto do provedor.
  const serializado = JSON.stringify(ev);
  assert(!serializado.includes('+5511999999999'), 'a trilha NÃO pode conter o telefone');
  assert(!serializado.includes('tok-da-inst-a'), 'a trilha NÃO pode conter o token');
  assert(!serializado.includes('"close"'), 'a trilha NÃO pode conter payload bruto do provedor');
});

Deno.test('CA2: reconexão detectada pelo monitor grava connection_connected', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c9', instance_id: 'inst-b', phone_number: null }];
  fake.statusById = { c9: 'disconnected' };
  fake.tokens = { 'inst-b': 'tok-da-inst-b' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });

  await run(fake);

  assert(fake.auditLogs.length === 1, `esperado 1 evento de trilha, veio ${fake.auditLogs.length}`);
  const ev = fake.auditLogs[0];
  assert(ev.action === 'connection_connected', `ação inesperada: ${String(ev.action)}`);
  const details = ev.details as Record<string, unknown>;
  assert(details.instance_id === 'inst-b', `details.instance_id inesperado: ${String(details.instance_id)}`);
  assert(details.previous_status === 'disconnected', `previous_status inesperado: ${String(details.previous_status)}`);
  assert(details.status === 'connected', `status inesperado: ${String(details.status)}`);
  assert(details.source === 'health-check', `origem inesperada: ${String(details.source)}`);
});

Deno.test('CA2: checagem SEM transição não grava linha de trilha', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  // Já está 'connected' e o provedor confirma 'open': nada muda na linha.
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });

  const res = await run(fake);

  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(fake.auditLogs.length === 0, `sem mudança de status não pode haver trilha, veio ${fake.auditLogs.length}`);
});

// ---------------------------------------------------------------------------
// Decisão 1C (2026-10-28): quem recebe o aviso de queda. Todo usuário com papel
// recebe por padrão; só não recebe quem desligou no cartão "Alertas de Conexão".
// ---------------------------------------------------------------------------

Deno.test('1C: usuário sem preferência salva recebe queda e degradação por push e e-mail', () => {
  const prefs = buildConnectionAlertPrefs(['u1'], []);
  const chaves = prefs.map((p) => `${p.user_id}:${p.channel}:${p.alert_type}`).sort();
  if (JSON.stringify(chaves) !== JSON.stringify(['u1:email:degraded', 'u1:email:disconnected', 'u1:push:degraded', 'u1:push:disconnected'])) {
    throw new Error(`esperado os 4 avisos padrão, veio ${JSON.stringify(chaves)}`);
  }
});

Deno.test('1C: quem desligou e-mail e degradação recebe só a queda por push', () => {
  const prefs = buildConnectionAlertPrefs(['u1'], [
    { user_id: 'u1', push_enabled: true, email_enabled: false, alert_on_degraded: false, alert_on_disconnected: true },
  ]);
  const chaves = prefs.map((p) => `${p.channel}:${p.alert_type}`);
  if (JSON.stringify(chaves) !== JSON.stringify(['push:disconnected'])) {
    throw new Error(`esperado só push:disconnected, veio ${JSON.stringify(chaves)}`);
  }
});

Deno.test('1C: quem desligou a queda não recebe nada de queda', () => {
  const prefs = buildConnectionAlertPrefs(['u1'], [
    { user_id: 'u1', push_enabled: true, email_enabled: true, alert_on_degraded: false, alert_on_disconnected: false },
  ]);
  if (prefs.length !== 0) throw new Error(`esperado nenhum aviso, veio ${prefs.length}`);
});

Deno.test('1C: usuário com dois papéis recebe uma vez só', () => {
  const prefs = buildConnectionAlertPrefs(['u1', 'u1', 'u2'], []);
  const pushQueda = prefs.filter((p) => p.channel === 'push' && p.alert_type === 'disconnected');
  if (pushQueda.length !== 2) throw new Error(`esperado 2 destinatários, veio ${pushQueda.length}`);
});

// ─────────────────────── Reconexão automática ──────────────────────────────

Deno.test('reconexão: decideReconnect respeita política, limite e intervalo', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const base = { enabled: true, attempts: 0, maxAttempts: 3, intervalSeconds: 60, lastAttemptAt: null, now };
  assert(decideReconnect({ ...base, enabled: false }) === 'disabled', 'política desligada não tenta');
  assert(decideReconnect(base) === 'attempt', 'primeira queda tenta');
  assert(decideReconnect({ ...base, attempts: 3 }) === 'exhausted', 'no limite para');
  assert(decideReconnect({ ...base, attempts: 1, lastAttemptAt: new Date('2026-11-01T11:59:30Z') }) === 'wait',
    'dentro do intervalo espera');
  assert(decideReconnect({ ...base, attempts: 1, lastAttemptAt: new Date('2026-11-01T11:58:00Z') }) === 'attempt',
    'passado o intervalo tenta de novo');
});

Deno.test('reconexão: conexão caída com política ligada chama /instance/reconnect e registra a tentativa', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 0, auto_reconnect_enabled: true, reconnect_max_attempts: 3, reconnect_interval_seconds: 60 }];
  fake.statusById = { c1: 'disconnected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = ({ path }) => path.includes('/instance/reconnect')
    ? jsonResponse({ message: 'success' })
    : jsonResponse({ instance: { state: 'close' } });

  const res = await run(fake);
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const reconnects = fake.calls.filter((c) => c.path.includes('/instance/reconnect'));
  assert(reconnects.length === 1, `esperada 1 tentativa, veio ${reconnects.length}`);
  const log = fake.auditLogs.find((l) => l.__reconnect);
  assert(log && log.attempt === 1 && log.result === 'success' && log.connection_id === 'c1', `log de tentativa inválido: ${JSON.stringify(log)}`);
  assert(fake.connUpdates.some((u) => u.retry_count === 1), 'retry_count deve ir para 1');
});

Deno.test('reconexão: política desligada (ou ausente) não tenta', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null }];
  fake.statusById = { c1: 'disconnected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'close' } });
  await run(fake);
  assert(!fake.calls.some((c) => c.path.includes('/instance/reconnect')), 'não deveria tentar reconectar');
  assert(!fake.insertTables.includes('reconnection_logs'), 'não deveria registrar tentativa');
});

Deno.test('reconexão: esgotadas as tentativas, para e pede o QR no motivo de saúde', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 3, auto_reconnect_enabled: true, reconnect_max_attempts: 3, reconnect_interval_seconds: 60 }];
  fake.statusById = { c1: 'disconnected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'close' } });
  await run(fake);
  assert(!fake.calls.some((c) => c.path.includes('/instance/reconnect')), 'esgotado não tenta');
  assert(fake.connUpdates.some((u) => u.health_reason === RECONNECT_EXHAUSTED_REASON), 'motivo de saúde deve pedir QR');
});

Deno.test('reconexão: conexão que volta zera o contador e o motivo', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 2, auto_reconnect_enabled: true, reconnect_max_attempts: 3, reconnect_interval_seconds: 60 }];
  fake.statusById = { c1: 'disconnected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });
  await run(fake);
  assert(fake.connUpdates.some((u) => u.retry_count === 0 && u.health_reason === null), 'deve zerar retry_count e health_reason');
});

// ───────────────────── regra dos três níveis (regras.md §4.2) ─────────────────────

Deno.test('3 níveis: decideEscalation — rápida=0, esgotada/fantasma/15min=1, 1h=2, degraded só ≥30min', () => {
  const now = new Date('2026-11-03T12:30:00Z');
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  assert(decideEscalation({ kind: 'disconnected', reason: null, exhausted: false, episodeStart: ago(5), now }) === 0, 'esperado nível 0: { kind: disconnected, reason: null, exhausted: false, episodeStart: ago');
  assert(decideEscalation({ kind: 'disconnected', reason: null, exhausted: true, episodeStart: ago(5), now }) === 1, 'esperado nível 1: { kind: disconnected, reason: null, exhausted: true, episodeStart: ago(');
  assert(decideEscalation({ kind: 'disconnected', reason: 'phantom_session', exhausted: false, episodeStart: null, now }) === 1, 'esperado nível 1: { kind: disconnected, reason: phantom_session, exhausted: false, epis');
  assert(decideEscalation({ kind: 'disconnected', reason: null, exhausted: false, episodeStart: ago(15), now }) === 1, 'esperado nível 1: { kind: disconnected, reason: null, exhausted: false, episodeStart: ago');
  assert(decideEscalation({ kind: 'disconnected', reason: null, exhausted: true, episodeStart: ago(60), now }) === 2, 'esperado nível 2: { kind: disconnected, reason: null, exhausted: true, episodeStart: ago(');
  assert(decideEscalation({ kind: 'degraded', reason: 'webhook_silent', exhausted: false, episodeStart: ago(29), now }) === 0, 'esperado nível 0: { kind: degraded, reason: webhook_silent, exhausted: false, episodeSt');
  assert(decideEscalation({ kind: 'degraded', reason: 'webhook_silent', exhausted: false, episodeStart: ago(30), now }) === 1, 'esperado nível 1: { kind: degraded, reason: webhook_silent, exhausted: false, episodeSt');
  assert(decideEscalation({ kind: 'degraded', reason: 'webhook_silent', exhausted: false, episodeStart: ago(600), now }) === 1, 'degraded nunca sobe a nível 2');
  assert(levelDedupeKey(1, 'disconnected', 'c1', now) === 'conn-l1:v1:disconnected:c1', 'chave do nível 1 leva o tipo');
  assert(levelDedupeKey(1, 'degraded', 'c1', now) !== levelDedupeKey(1, 'disconnected', 'c1', now), 'degraded e disconnected não dividem chave');
  assert(levelDedupeKey(2, 'disconnected', 'c1', now) === levelDedupeKey(2, 'disconnected', 'c1', ago(20)), 'nível 2 repete por hora cheia');
  assert(levelDedupeKey(2, 'disconnected', 'c1', now) !== levelDedupeKey(2, 'disconnected', 'c1', ago(60)), 'hora seguinte = chave nova');
});

Deno.test('3 níveis: queda rápida (nível 0) grava o warroom mas NÃO manda push nem e-mail a ninguém', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 0, auto_reconnect_enabled: true, reconnect_max_attempts: 3, reconnect_interval_seconds: 60 }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.roleRows = [{ user_id: 'adm', role: 'admin' }, { user_id: 'sup', role: 'supervisor' }];
  fake.adminProfiles = [{ user_id: 'adm', email: 'adm@x.test' }];
  fake.fetchImpl = ({ path }) => path.includes('/emails') ? jsonResponse({ id: 'mail' }) : jsonResponse({ instance: { state: 'close' } });
  await run(fake);
  assert(fake.alerts.some((a) => a.dedupe_key === 'conn-down:v1:c1'), 'warroom (tela) deve registrar a queda');
  assert(fake.pushNotifications.length === 0, `nível 0 não manda push: ${JSON.stringify(fake.pushNotifications)}`);
  assert(!fake.calls.some((c) => c.path.includes('/emails')), 'nível 0 não manda e-mail');
});

Deno.test('3 níveis: reconexão esgotada (nível 1) avisa admin E supervisor por push+e-mail, mesmo sem opt-in, uma vez por episódio', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 3, auto_reconnect_enabled: true, reconnect_max_attempts: 3, reconnect_interval_seconds: 60 }];
  fake.statusById = { c1: 'disconnected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.roleRows = [{ user_id: 'adm', role: 'admin' }, { user_id: 'sup', role: 'supervisor' }, { user_id: 'ag', role: 'agent' }];
  fake.adminProfiles = [{ user_id: 'adm', email: 'adm@x.test' }, { user_id: 'sup', email: 'sup@x.test' }];
  fake.episodeStartedAt = new Date(Date.now() - 5 * 60_000).toISOString();
  fake.fetchImpl = ({ path }) => path.includes('/emails') ? jsonResponse({ id: 'mail' }) : jsonResponse({ instance: { state: 'close' } });
  const originalKey = Deno.env.get('RESEND_API_KEY');
  Deno.env.set('RESEND_API_KEY', 're_test');
  try {
    await run(fake);
    await run(fake);
  } finally {
    if (originalKey === undefined) Deno.env.delete('RESEND_API_KEY'); else Deno.env.set('RESEND_API_KEY', originalKey);
  }
  // admin e supervisor são obrigatórios; o agente entra pelo opt-in padrão (1C: ligado
  // até desligar no cartão) — preferência só ACRESCENTA gente. Uma vez por episódio.
  const pushes = fake.pushNotifications.filter((n) => (n as Row).dedupe_key === 'conn-l1:v1:disconnected:c1');
  const users = pushes.map((n) => (n as Row).user_id).sort();
  assert(JSON.stringify(users) === JSON.stringify(['adm', 'ag', 'sup']), `push uma vez para cada destinatário: ${JSON.stringify(users)}`);
  const emailMarks = fake.pushNotifications.filter((n) => (n as Row).dedupe_key === 'conn-l1:v1:disconnected:c1:email').map((n) => (n as Row).user_id).sort();
  assert(JSON.stringify(emailMarks) === JSON.stringify(['adm', 'sup']), `marcador de e-mail só para quem tem e-mail no perfil: ${JSON.stringify(emailMarks)}`);
  const emails = fake.calls.filter((c) => c.path.includes('/emails')).length;
  assert(emails === 2, `e-mail uma vez para cada perfil com e-mail (adm, sup), veio ${emails}`);
});

Deno.test('3 níveis: ≥ 1 h caída (nível 2) repete por hora só para o admin', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 3, auto_reconnect_enabled: true, reconnect_max_attempts: 3, reconnect_interval_seconds: 60 }];
  fake.statusById = { c1: 'disconnected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.roleRows = [{ user_id: 'adm', role: 'admin' }, { user_id: 'sup', role: 'supervisor' }];
  fake.episodeStartedAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'close' } });
  await run(fake);
  // Primeira sonda elegível já depois de 1 h: o nível 1 (admin+supervisor) sai ANTES do nível 2 (só admin).
  const l1 = fake.pushNotifications.filter((n) => (n as Row).dedupe_key === 'conn-l1:v1:disconnected:c1').map((n) => (n as Row).user_id).sort();
  const l2 = fake.pushNotifications.filter((n) => String((n as Row).dedupe_key).startsWith('conn-l2:') && !String((n as Row).dedupe_key).endsWith(':email')).map((n) => (n as Row).user_id);
  assert(JSON.stringify(l1) === JSON.stringify(['adm', 'sup']), `nível 1 implícito para admin+supervisor: ${JSON.stringify(l1)}`);
  assert(JSON.stringify(l2) === JSON.stringify(['adm']), `nível 2 só admin: ${JSON.stringify(l2)}`);
  assert(String((fake.pushNotifications.find((n) => String((n as Row).dedupe_key).startsWith('conn-l2:')) as Row).dedupe_key).startsWith('conn-l2:v1:disconnected:c1:'), 'chave horária do nível 2');
});

Deno.test('3 níveis: sessão fantasma é nível 1 imediato (sem esperar 15 min)', () => {
  const now = new Date();
  const ev = evaluateOpenConnectionHealth({ owner: { known: true, ownerJid: null }, lastActivityAt: null, now });
  assert(ev.reason === 'phantom_session', 'owner conhecido sem jid = sessão fantasma');
  assert(decideEscalation({ kind: 'disconnected', reason: ev.reason, exhausted: false, episodeStart: now, now }) === 1, 'fantasma é nível 1 imediato');
  assert(PHANTOM_SESSION_REASON.includes('QR Code'), 'motivo de saúde deve pedir QR');
});

Deno.test('3 níveis: e-mail recusado pelo Resend não grava o marcador — a próxima sonda tenta de novo', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 3, auto_reconnect_enabled: true, reconnect_max_attempts: 3, reconnect_interval_seconds: 60 }];
  fake.statusById = { c1: 'disconnected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.roleRows = [{ user_id: 'adm', role: 'admin' }];
  fake.adminProfiles = [{ user_id: 'adm', email: 'adm@x.test' }];
  fake.episodeStartedAt = new Date(Date.now() - 5 * 60_000).toISOString();
  let resendDown = true;
  fake.fetchImpl = ({ path }) => path.includes('/emails')
    ? (resendDown ? new Response('down', { status: 500 }) : jsonResponse({ id: 'mail' }))
    : jsonResponse({ instance: { state: 'close' } });
  const originalKey = Deno.env.get('RESEND_API_KEY');
  Deno.env.set('RESEND_API_KEY', 're_test');
  try {
    await run(fake);
    const pushKeys = () => fake.pushNotifications.map((n) => String((n as Row).dedupe_key));
    assert(pushKeys().includes('conn-l1:v1:disconnected:c1'), 'push obrigatório sai mesmo com o Resend fora (5xx)');
    assert(!pushKeys().includes('conn-l1:v1:disconnected:c1:email'), 'e-mail com 5xx não grava marcador');
    resendDown = false;
    await run(fake);
    assert(pushKeys().includes('conn-l1:v1:disconnected:c1:email'), 'na sonda seguinte, e-mail aceito → marcador de e-mail');
    await run(fake);
    const emails = fake.calls.filter((c) => c.path.includes('/emails')).length;
    assert(emails === 2, `duas tentativas de e-mail (1 recusada + 1 aceita), nunca uma terceira: veio ${emails}`);
  } finally {
    if (originalKey === undefined) Deno.env.delete('RESEND_API_KEY'); else Deno.env.set('RESEND_API_KEY', originalKey);
  }
});

Deno.test('3 níveis: recuperação já gravada pelo webhook ainda retoma campanhas e libera as chaves de nível', async () => {
  const fake = baseFake();
  // O webhook já deixou status='connected'; a sonda não transiciona nada (CAS não entra).
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 0 }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.pausedCampaigns = [{ id: 'camp-1' }];
  fake.pushNotifications = [{ user_id: 'adm', dedupe_key: 'conn-l1:v1:disconnected:c1' }];
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });
  await run(fake);
  assert(fake.rpcCalls.includes('transition:camp-1:start'), `campanha pausada por queda deve retomar: ${JSON.stringify(fake.rpcCalls)}`);
  assert((fake.pushNotifications[0] as Row).dedupe_key === null, 'chave de nível liberada para a próxima queda');
  assert(fake.alertUpdates.some((u) => u.filters.some(([c, v]) => c === 'dedupe_key' && v === 'conn-down:v1:c1')), 'warroom da queda encerrado mesmo com recuperação vinda do webhook');
});

Deno.test('3 níveis: sem linha no warroom, a sonda cria o registro e o relógio do episódio começa (não fica em zero)', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 0, auto_reconnect_enabled: false }];
  fake.statusById = { c1: 'disconnected' }; // já caída antes, sem alerta gravado
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'close' } });
  await run(fake);
  assert(fake.alerts.some((a) => a.dedupe_key === 'conn-down:v1:c1'), 'episódio sem registro deve ser criado pela sonda');
});

Deno.test('3 níveis: degradação encerrada (sonda saudável) libera só a chave degraded; a de queda fica intacta até a conexão voltar', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 0 }];
  fake.statusById = { c1: 'connected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.lastInbound = [{ created_at: new Date().toISOString() }]; // mensagem recente = healthy
  fake.pushNotifications = [
    { user_id: 'adm', dedupe_key: 'conn-l1:v1:degraded:c1' },
    { user_id: 'adm', dedupe_key: 'conn-l1:v1:disconnected:c1' },
  ];
  fake.alerts = [{ source: 'connection-health-check', dedupe_key: 'conn-degraded:v1:c1', created_at: new Date().toISOString() }];
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'open' } });
  await run(fake);
  assert((fake.pushNotifications[0] as Row).dedupe_key === null, 'chave degraded liberada ao ficar saudável');
  assert((fake.pushNotifications[1] as Row).dedupe_key === null, 'conexão connected também libera a chave de queda (recuperação idempotente)');
  assert(fake.alerts[0].dedupe_key === null, 'alerta de warroom da degradação encerrado');
});

Deno.test('3 níveis: queda confirmada só pelo tempo (sem reconexão automática) grava motivo que pede QR — composer vermelho', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 0, auto_reconnect_enabled: false }];
  fake.statusById = { c1: 'disconnected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.roleRows = [{ user_id: 'adm', role: 'admin' }];
  fake.episodeStartedAt = new Date(Date.now() - 20 * 60_000).toISOString();
  fake.fetchImpl = () => jsonResponse({ instance: { state: 'close' } });
  await run(fake);
  assert(fake.connUpdates.some((u) => u.health_reason === CONFIRMED_DOWN_REASON), 'queda confirmada pelo tempo grava o motivo');
  assert(fake.pushNotifications.some((n) => (n as Row).dedupe_key === 'conn-l1:v1:disconnected:c1'), 'admin avisado no nível 1');
});

Deno.test('3 níveis: quem só optou por e-mail recebe o e-mail (marcador lido em tela), sem push', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 3, auto_reconnect_enabled: true, reconnect_max_attempts: 3, reconnect_interval_seconds: 60 }];
  fake.statusById = { c1: 'disconnected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.roleRows = [{ user_id: 'ag', role: 'agent' }];
  fake.adminProfiles = [{ user_id: 'ag', email: 'ag@x.test' }];
  fake.episodeStartedAt = new Date(Date.now() - 5 * 60_000).toISOString();
  fake.fetchImpl = ({ path }) => path.includes('/emails') ? jsonResponse({ id: 'mail' }) : jsonResponse({ instance: { state: 'close' } });
  const originalKey = Deno.env.get('RESEND_API_KEY');
  Deno.env.set('RESEND_API_KEY', 're_test');
  try {
    // connection_alert_preferences: push desligado, e-mail ligado
    fake.prefRows = [{ user_id: 'ag', push_enabled: false, email_enabled: true, alert_on_degraded: true, alert_on_disconnected: true }];
    await run(fake);
  } finally {
    if (originalKey === undefined) Deno.env.delete('RESEND_API_KEY'); else Deno.env.set('RESEND_API_KEY', originalKey);
  }
  const keys = fake.pushNotifications.map((n) => String((n as Row).dedupe_key));
  assert(!keys.includes('conn-l1:v1:disconnected:c1'), 'sem push para quem desligou push');
  assert(keys.includes('conn-l1:v1:disconnected:c1:email'), 'marcador de e-mail gravado');
  assert((fake.pushNotifications[0] as Row).is_read === true, 'marcador de e-mail nasce lido (não é push)');
  assert(fake.calls.some((c) => c.path.includes('/emails')), 'e-mail enviado');
});

Deno.test('3 níveis: recusa definitiva do Resend (4xx) marca o e-mail e não repete a cada sonda', async () => {
  const fake = baseFake();
  fake.rows = [{ id: 'c1', instance_id: 'padrao', phone_number: null, retry_count: 3, auto_reconnect_enabled: true, reconnect_max_attempts: 3, reconnect_interval_seconds: 60 }];
  fake.statusById = { c1: 'disconnected' };
  fake.tokens = { padrao: 'tok-da-padrao' };
  fake.roleRows = [{ user_id: 'adm', role: 'admin' }];
  fake.adminProfiles = [{ user_id: 'adm', email: 'adm@x.test' }];
  fake.episodeStartedAt = new Date(Date.now() - 5 * 60_000).toISOString();
  fake.fetchImpl = ({ path }) => path.includes('/emails') ? new Response('bad address', { status: 422 }) : jsonResponse({ instance: { state: 'close' } });
  const originalKey = Deno.env.get('RESEND_API_KEY');
  Deno.env.set('RESEND_API_KEY', 're_test');
  try {
    await run(fake);
    await run(fake);
  } finally {
    if (originalKey === undefined) Deno.env.delete('RESEND_API_KEY'); else Deno.env.set('RESEND_API_KEY', originalKey);
  }
  const emails = fake.calls.filter((c) => c.path.includes('/emails')).length;
  assert(emails === 1, `4xx é final: uma tentativa só, veio ${emails}`);
  assert(fake.pushNotifications.some((n) => (n as Row).dedupe_key === 'conn-l1:v1:disconnected:c1'), 'push obrigatório sai mesmo assim');
});
