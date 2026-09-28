import { handleTalkxSend, personalize } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const contact = { name: 'Joao Silva', nickname: 'Joao', company: 'Empresa Teste' };

Deno.test('personalize resolves the built-in placeholders (nome/apelido/empresa/saudacao)', () => {
  const result = personalize('Ola {{nome}}, aqui é da {{empresa}}', contact, {});
  assert(result === 'Ola Joao, aqui é da Empresa Teste', `unexpected result: ${result}`);
});

Deno.test('personalize falls back to a bracket placeholder for an unresolved variable instead of throwing', () => {
  // Regressão: campanha sem template salvo (template_id null) ou contato sem
  // aquele campo customizado preenchido não pode derrubar o envio inteiro com
  // unknown_placeholder — antes isso falhava 100% dos destinatários.
  const result = personalize('Seu cargo é {{cargo}}', contact, {});
  assert(result === 'Seu cargo é [cargo]', `unexpected result: ${result}`);
});

Deno.test('personalize substitutes the real value when the contact has that custom field', () => {
  // Regressão: o envio real de campanha (talkx-send, action=start) sempre
  // "resolvia" variável customizada como o próprio nome entre colchetes
  // (ex.: {{cargo}} -> "[cargo]"), nunca o dado real de contact_custom_fields.
  const result = personalize('Seu cargo é {{cargo}}', contact, { cargo: 'Diretor de Vendas' });
  assert(result === 'Seu cargo é Diretor de Vendas', `unexpected result: ${result}`);
});

Deno.test('personalize resolves multiple custom values in the same message', () => {
  const result = personalize(
    'Ola {{nome}}, seu cargo e {{cargo}} no time {{time}}',
    contact,
    { cargo: 'Diretor', time: 'Vendas' },
  );
  assert(result === 'Ola Joao, seu cargo e Diretor no time Vendas', `unexpected result: ${result}`);
});

Deno.test('personalize replaces {{link}} with the per-recipient tracking URL when provided', () => {
  const result = personalize('Veja aqui: {{link}}', contact, {}, 'America/Sao_Paulo', 'https://zapp.example/l/abc');
  assert(result === 'Veja aqui: https://zapp.example/l/abc', `unexpected result: ${result}`);
});

Deno.test('personalize falls back to a bracket placeholder for {{link}} when no tracking URL is available', () => {
  const result = personalize('Veja aqui: {{link}}', contact, {});
  assert(result === 'Veja aqui: [link]', `unexpected result: ${result}`);
});

Deno.test('personalize matches a custom field key case-insensitively', () => {
  // Regressão: o CRM guarda o nome do campo como foi digitado (ex.: "CPF"),
  // mas o editor de template força minúsculo no placeholder ({{cpf}}) — o
  // match não pode depender de bater exatamente a mesma caixa.
  const result = personalize('CPF: {{cpf}}', contact, { CPF: '000.000.000-00' });
  assert(result === 'CPF: 000.000.000-00', `unexpected result: ${result}`);
});

Deno.test('personalize ignores a custom value using a reserved built-in name', () => {
  // Regressão: um campo customizado chamado "link" comia {{link}} antes do
  // passe de tracking, e um campo "nome"/"empresa" sequestrava o dado real do
  // contato.
  const result = personalize(
    'Nome: {{nome}} - Link: {{link}}',
    contact,
    { nome: 'Valor Errado', link: 'https://phishing.example' },
    'America/Sao_Paulo',
    'https://zapp.example/l/abc',
  );
  assert(result === 'Nome: Joao - Link: https://zapp.example/l/abc', `unexpected result: ${result}`);
});

Deno.test('personalize does not reinterpret placeholder-shaped text inside a custom value', () => {
  // Regressão: um campo customizado com valor literal "{{empresa}}" não pode
  // ser reescaneado e virar o nome da empresa do contato — é o dado de CRM
  // como está, ponto.
  const result = personalize('Cargo: {{cargo}}', contact, { cargo: '{{empresa}}' });
  assert(result === 'Cargo: {{empresa}}', `unexpected result: ${result}`);
});

Deno.test('personalize does not leak an inherited Object.prototype property for an unresolved placeholder', () => {
  // Regressão: "key in contactValues" também acha propriedades herdadas
  // (constructor, __proto__, etc.) antes de consultar o mapa de valores
  // customizados — um placeholder desses vazaria texto de função/objeto em
  // vez de cair no fallback "[variavel]".
  const result = personalize('X: {{constructor}}', contact, {});
  assert(result === 'X: [constructor]', `unexpected result: ${result}`);
});

// ---------------------------------------------------------------------------
// handleTalkxSend — cobertura dos caminhos de autenticação
// ---------------------------------------------------------------------------

const TEST_SERVICE_KEY = "eyJtest.servicekey.forauth";

function makePost(opts: {
  bearer?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.bearer !== undefined) headers["Authorization"] = `Bearer ${opts.bearer}`;
  return new Request("https://edge.test/talkx-send", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function qb(overrides: Record<string, () => unknown> = {}): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  const chain = () => b;
  b.select = chain; b.eq = chain; b.in = chain; b.limit = chain;
  b.is = chain; b.update = chain;
  b.single = () => Promise.resolve({ data: null, error: { message: "not found" } });
  b.maybeSingle = () => Promise.resolve({ data: null, error: null });
  Object.assign(b, overrides);
  return b;
}

interface MockOpts {
  authUser?: { id: string } | null;
  authUserError?: boolean;
  roleData?: { role: string } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDeps(opts: MockOpts): any {
  return {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      auth: {
        getUser(_token: string) {
          if (opts.authUserError) {
            return Promise.resolve({ data: { user: null }, error: new Error("invalid token") });
          }
          const user = opts.authUser ?? null;
          return Promise.resolve({ data: { user }, error: user ? null : new Error("no user") });
        },
      },
      from(table: string) {
        if (table === "user_roles") {
          return qb({ maybeSingle: () => Promise.resolve({ data: opts.roleData ?? null, error: null }) });
        }
        return qb();
      },
    },
  };
}

Deno.test("auth: sem Authorization header → 401", async () => {
  const req = makePost({});
  const res = await handleTalkxSend(req, mockDeps({}));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com service-role key correta → passa auth, chega no 400 de campaignId ausente", async () => {
  const req = makePost({ bearer: TEST_SERVICE_KEY });
  const res = await handleTalkxSend(req, mockDeps({}));
  assert(res.status === 400, `esperado 400 (auth ok via service key), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "campaignId required", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT inválido (getUser retorna error) → 401", async () => {
  const req = makePost({ bearer: "eyJinvalid.jwt.token" });
  const res = await handleTalkxSend(req, mockDeps({ authUserError: true }));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT válido mas sem role admin/supervisor → 403", async () => {
  const req = makePost({ bearer: "eyJvalid.user.token.xx" });
  const res = await handleTalkxSend(req, mockDeps({
    authUser: { id: "user-001" },
    roleData: null,
  }));
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT válido e role admin → passa auth, chega no 400 de campaignId ausente", async () => {
  const req = makePost({ bearer: "eyJvalid.admin.token.xx" });
  const res = await handleTalkxSend(req, mockDeps({
    authUser: { id: "user-admin-001" },
    roleData: { role: "admin" },
  }));
  assert(res.status === 400, `esperado 400 (auth ok via JWT admin), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "campaignId required", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com JWT válido e role supervisor → passa auth, chega no 400 de campaignId ausente", async () => {
  const req = makePost({ bearer: "eyJvalid.supervisor.token.xx" });
  const res = await handleTalkxSend(req, mockDeps({
    authUser: { id: "user-supervisor-001" },
    roleData: { role: "supervisor" },
  }));
  assert(res.status === 400, `esperado 400 (auth ok via JWT supervisor), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "campaignId required", `body inesperado: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// Utilitários para testes de integração de dispatch
// ---------------------------------------------------------------------------

const CAMPAIGN_ID = "campaign-dispatch-001";
const CONNECTION_ID = "conn-dispatch-001";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function thenableQB(result: { data: unknown; error: unknown }): any {
  const p = Promise.resolve(result);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: any = {
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej),
    catch: (fn: (e: unknown) => unknown) => p.catch(fn),
    single: () => p,
    maybeSingle: () => p,
  };
  for (const m of ["select","eq","neq","in","or","order","range","limit","is","not","update","insert","upsert","delete"]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any)[m] = () => self;
  }
  return self;
}

function makeCampaign(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CAMPAIGN_ID, status: "sending", whatsapp_connection_id: CONNECTION_ID,
    message_template: "Ola {{nome}}, tudo bem?", template_id: null, media_url: null,
    media_type: null, sent_count: 0, failed_count: 0, send_interval_min: 0,
    send_interval_max: 0, typing_delay_min: 0, typing_delay_max: 0,
    send_window_start: null, send_window_end: null, business_hours_only: false,
    speed_profile: null, schedule_timezone: "America/Sao_Paulo", ...overrides,
  };
}

function makeConnection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: CONNECTION_ID, status: "connected", instance_id: "PRINCIPAL", ...overrides };
}

function makeRecipient(): Record<string, unknown> {
  return {
    id: "recipient-dispatch-001", campaign_id: CAMPAIGN_ID, contact_id: "contact-dispatch-001",
    status: "pending", attempt_count: 0, retry_after: null, message_snapshot_at: null,
    personalized_message: null, media_url_snapshot: null, media_type_snapshot: null,
    variant_id: null,
    contacts: { name: "João Silva", nickname: "João", phone: "+5511999990001", company: "Empresa Teste" },
  };
}

function makeDispatchDeps(opts: {
  campaign?: Record<string, unknown> | null;
  connection?: Record<string, unknown> | null;
  recipients?: Record<string, unknown>[];
  suppressAll?: boolean;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} = {}): any {
  const campaign = opts.campaign === undefined ? makeCampaign() : opts.campaign;
  const connection = opts.connection === undefined ? makeConnection() : opts.connection;
  const recipients = opts.recipients ?? [makeRecipient()];
  const suppress = opts.suppressAll ?? false;
  return {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: new Error("") }) },
      rpc(name: string, _args?: unknown): Promise<{ data?: unknown; error: unknown }> {
        if (name === "transition_talkx_campaign") return Promise.resolve({ data: [{ current_status: "sending" }], error: null });
        if (name === "claim_talkx_recipient") return Promise.resolve({ data: [{ claim_token: "claim-tok-001" }], error: null });
        if (name === "talkx_recipient_is_suppressed") return Promise.resolve({ data: suppress, error: null });
        if (name === "persist_talkx_recipient_message_snapshot") return Promise.resolve({
          data: [{ personalized_message: "Ola João, tudo bem?", media_url_snapshot: null, media_type_snapshot: null }],
          error: null,
        });
        if (name === "mark_talkx_recipient_dispatch_started") return Promise.resolve({ data: null, error: null });
        if (name === "record_talkx_recipient_sent") return Promise.resolve({ data: null, error: null });
        if (name === "complete_talkx_recipient") return Promise.resolve({ data: null, error: null });
        if (name === "complete_talkx_campaign_if_drained") return Promise.resolve({ data: true, error: null });
        if (name === "reschedule_talkx_recipient") return Promise.resolve({ data: null, error: null });
        if (name === "release_talkx_recipient_claim") return Promise.resolve({ data: true, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        if (table === "talkx_campaigns") return thenableQB({ data: campaign, error: campaign ? null : { message: "not found" } });
        if (table === "whatsapp_connections") return thenableQB({ data: connection, error: null });
        if (table === "talkx_recipients") return thenableQB({ data: recipients, error: null });
        if (table === "talkx_links") return thenableQB({ data: null, error: null });
        if (table === "contact_custom_fields") return thenableQB({ data: [], error: null });
        return thenableQB({ data: null, error: null });
      },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTestActionDeps(connection: Record<string, unknown> | null): any {
  return {
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: new Error("") }) },
      rpc: () => Promise.resolve({ data: null, error: null }),
      from(table: string) {
        if (table === "whatsapp_connections") return thenableQB({ data: connection, error: null });
        return thenableQB({ data: null, error: null });
      },
    },
  };
}

function setDispatchEnv(): void {
  Deno.env.set("SUPABASE_URL", "https://supabase-test.example");
  Deno.env.set("EVOLUTION_API_URL", "https://evolution-test.example");
  Deno.env.set("EVOLUTION_API_KEY", "test-evolution-api-key");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  Deno.env.set("EVOLUTION_INSTANCE_TOKEN", "test-instance-token");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFetch = (url: any, opts?: any) => Promise<Response>;

function mockGlobalFetch(failUrlFragment?: string): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orig = (globalThis as any).fetch as AnyFetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = (url: unknown, _opts?: unknown): Promise<Response> => {
    const urlStr = String(url);
    if (failUrlFragment && urlStr.includes(failUrlFragment)) {
      return Promise.resolve(new Response(JSON.stringify({ error: "mock server error" }), { status: 500 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ key: { id: "provider-msg-test-001" } }), { status: 200 }));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return () => { (globalThis as any).fetch = orig; };
}

function makeDispatchPost(opts: { action?: string; campaignId?: string; extra?: Record<string, unknown> } = {}): Request {
  return makePost({
    bearer: TEST_SERVICE_KEY,
    body: { action: opts.action ?? "start", campaignId: opts.campaignId ?? CAMPAIGN_ID, ...opts.extra },
  });
}

// ---------------------------------------------------------------------------
// Testes de integração — dispatch/start
// ---------------------------------------------------------------------------

Deno.test("dispatch/start: happy path — 1 destinatário de texto → sent=1", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps());
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.sent === 1, `esperado sent:1, recebido sent:${body.sent}`);
    assert(body.failed === 0, `esperado failed:0, recebido failed:${body.failed}`);
    assert(body.total === 1, `esperado total:1, recebido total:${body.total}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start: campanha não encontrada → 404", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps({ campaign: null }));
    assert(res.status === 404, `esperado 404, recebido ${res.status}`);
    const body = await res.json();
    assert(body.error === "Campaign not found", `body inesperado: ${JSON.stringify(body)}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start: conexão WhatsApp ausente → 409", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps({ connection: null }));
    assert(res.status === 409, `esperado 409, recebido ${res.status}`);
    const body = await res.json();
    assert(typeof body.error === "string" && body.error.includes("WhatsApp connection"),
      `body inesperado: ${JSON.stringify(body)}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start: janela de envio fechada → 200 ok:false", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makeDispatchPost();
    const campaign = makeCampaign({ send_window_start: "00:00", send_window_end: "00:00" });
    const res = await handleTalkxSend(req, makeDispatchDeps({ campaign }));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.ok === false, `esperado ok:false, recebido: ${JSON.stringify(body)}`);
    assert(body.reason === "outside_send_window", `reason inesperado: ${body.reason}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start: destinatário suprimido → blacklisted=1, sent=0", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps({ suppressAll: true }));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.blacklisted === 1, `esperado blacklisted:1, recebido blacklisted:${body.blacklisted}`);
    assert(body.sent === 0, `esperado sent:0, recebido sent:${body.sent}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/start: Evolution GO retorna 5xx → outcome_unknown=1, sent=0", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch("/message/sendText");
  try {
    const req = makeDispatchPost();
    const res = await handleTalkxSend(req, makeDispatchDeps());
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(body.outcome_unknown === 1, `esperado outcome_unknown:1, recebido: ${JSON.stringify(body)}`);
    assert(body.sent === 0, `esperado sent:0, recebido sent:${body.sent}`);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Testes de integração — dispatch/test
// ---------------------------------------------------------------------------

Deno.test("dispatch/test: envia template de teste com sucesso → provider_message_id devolvido", async () => {
  setDispatchEnv();
  const restore = mockGlobalFetch();
  try {
    const req = makePost({
      bearer: TEST_SERVICE_KEY,
      body: { action: "test", templateContent: "Ola {{nome}}, tudo bem?", phone: "+5511999990001" },
    });
    const res = await handleTalkxSend(req, makeTestActionDeps(makeConnection()));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const body = await res.json();
    assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
    assert(typeof body.provider_message_id === "string" && body.provider_message_id.length > 0,
      `provider_message_id ausente: ${JSON.stringify(body)}`);
  } finally {
    restore();
  }
});

Deno.test("dispatch/test: sem conexão WhatsApp ativa → 400", async () => {
  setDispatchEnv();
  const req = makePost({
    bearer: TEST_SERVICE_KEY,
    body: { action: "test", templateContent: "Ola {{nome}}", phone: "+5511999990001" },
  });
  const res = await handleTalkxSend(req, makeTestActionDeps(null));
  assert(res.status === 400, `esperado 400, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Nenhuma conexao WhatsApp ativa", `body inesperado: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// Testes de integração — dispatch/pause e dispatch/cancel
// ---------------------------------------------------------------------------

Deno.test("dispatch/pause: transição bem-sucedida → success:true com current_status", async () => {
  setDispatchEnv();
  const req = makePost({ bearer: TEST_SERVICE_KEY, body: { action: "pause", campaignId: CAMPAIGN_ID } });
  const res = await handleTalkxSend(req, makeDispatchDeps());
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
  assert(typeof body.status === "string", `status ausente: ${JSON.stringify(body)}`);
});

Deno.test("dispatch/cancel: transição bem-sucedida → success:true com current_status", async () => {
  setDispatchEnv();
  const req = makePost({ bearer: TEST_SERVICE_KEY, body: { action: "cancel", campaignId: CAMPAIGN_ID } });
  const res = await handleTalkxSend(req, makeDispatchDeps());
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `esperado success:true, recebido: ${JSON.stringify(body)}`);
  assert(typeof body.status === "string", `status ausente: ${JSON.stringify(body)}`);
});

// ---------------------------------------------------------------------------
// Testes de integração — ação não implementada
// ---------------------------------------------------------------------------

Deno.test("dispatch/resume: ação não implementada → 400 Invalid campaign action", async () => {
  setDispatchEnv();
  const req = makePost({ bearer: TEST_SERVICE_KEY, body: { action: "resume", campaignId: CAMPAIGN_ID } });
  const res = await handleTalkxSend(req, makeDispatchDeps());
  assert(res.status === 400, `esperado 400, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Invalid campaign action", `body inesperado: ${JSON.stringify(body)}`);
});
