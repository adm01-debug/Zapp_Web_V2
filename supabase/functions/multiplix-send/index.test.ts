import { handleMultiplixSend, personalizeMultiplix } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('personalizeMultiplix resolves {{empresa}} com o nome da empresa', () => {
  const result = personalizeMultiplix('Ola, aqui é da {{empresa}}', { name: 'Empresa Teste' });
  assert(result === 'Ola, aqui é da Empresa Teste', `unexpected result: ${result}`);
});

Deno.test('personalizeMultiplix resolve {{saudacao}} para um período válido do dia', () => {
  // getGreeting() usa a hora real — só valida que retorna uma das 3 saudações
  // esperadas, sem travar o teste a um horário fixo de execução do CI.
  const result = personalizeMultiplix('{{saudacao}}, {{empresa}}!', { name: 'Acme' });
  const validGreetings = ['Bom dia, Acme!', 'Boa tarde, Acme!', 'Boa noite, Acme!'];
  assert(validGreetings.includes(result), `unexpected greeting result: ${result}`);
});

Deno.test('personalizeMultiplix usa string vazia quando company.name é ausente/null', () => {
  const result = personalizeMultiplix('Empresa: {{empresa}}', {});
  assert(result === 'Empresa: ', `unexpected result: ${result}`);
});

Deno.test('personalizeMultiplix lança unknown_placeholder para variável fora do conjunto fixo', () => {
  // Multiplix nao tem custom_variables (diferente do talkx-send) — todo
  // placeholder que nao seja {{empresa}}/{{saudacao}} deve falhar explicito
  // em vez de vazar {{...}} intacto pra mensagem real do WhatsApp.
  let threw = false;
  try {
    personalizeMultiplix('Seu cargo é {{cargo}}', { name: 'Acme' });
  } catch (e) {
    threw = true;
    assert(e instanceof Error && e.message.includes('unknown_placeholder: {{cargo}}'), `unexpected error: ${e}`);
  }
  assert(threw, 'expected personalizeMultiplix to throw for an unregistered placeholder');
});

Deno.test('personalizeMultiplix é case-insensitive nos placeholders conhecidos', () => {
  const result = personalizeMultiplix('{{SAUDACAO}}, {{Empresa}}!', { name: 'Acme' });
  const validGreetings = ['Bom dia, Acme!', 'Boa tarde, Acme!', 'Boa noite, Acme!'];
  assert(validGreetings.includes(result), `unexpected greeting result: ${result}`);
});

// ---------------------------------------------------------------------------
// handleMultiplixSend — autenticação (F06/F07) e motor de envio (F09/F11a/F17)
// ---------------------------------------------------------------------------

const TEST_CRON_SECRET = "cron-secret-test-64chars-for-timing-safe-comparison-xxxxxxxxxxxx";
const TEST_SERVICE_KEY = "eyJtest.servicekey.forauth";
const TEST_JWT = "eyJvalid.user.token.xx";

function makePost(opts: {
  cronSecret?: string;
  bearer?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cronSecret !== undefined) headers["x-cron-secret"] = opts.cronSecret;
  if (opts.bearer !== undefined) headers["Authorization"] = `Bearer ${opts.bearer}`;
  return new Request("https://edge.test/multiplix-send", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? { dispatchId: "00000000-0000-0000-0000-000000000001" }),
  });
}

interface DispatchRow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function dispatchRow(overrides: DispatchRow = {}): DispatchRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Disparo",
    message_template: "Ola {{empresa}}",
    status: "sending",
    created_by: "profile-me",
    whatsapp_connection_id: "conn-0001",
    total_recipients: 0,
    sent_count: 0,
    failed_count: 0,
    send_interval_min: 0,
    send_interval_max: 0,
    typing_delay_min: 0,
    typing_delay_max: 0,
    send_window_start: null,
    send_window_end: null,
    business_hours_only: false,
    speed_profile: "normal",
    schedule_timezone: "America/Sao_Paulo",
    media_url: null,
    media_type: null,
    scheduled_at: null,
    ...overrides,
  };
}

function recipientRow(index: number, phone: string | null) {
  return {
    id: `recipient-${index}`,
    dispatch_id: "00000000-0000-0000-0000-000000000001",
    company_id: `company-${index}`,
    company_name_snapshot: `Empresa ${index}`,
    destino_e164: phone,
    destino_origem: "singu",
    status: "pending",
    attempt_count: 0,
    retry_after: null,
    personalized_message: null,
    created_at: new Date(Date.now() + index).toISOString(),
  };
}

interface MockOpts {
  cronVaultResult?: string | null;
  cronVaultError?: boolean;
  authUser?: { id: string } | null;
  authUserError?: boolean;
  /** resposta de is_admin_or_supervisor (F07) */
  isAdminOrSupervisor?: boolean;
  /** resposta de user_has_permission('multiplix.dispatch.manage_all') (F06) */
  manageAll?: boolean;
  /** perfil (profiles.id) do usuario do JWT — e o que casa com created_by */
  ownProfileId?: string;
  dispatch?: DispatchRow | null;
  connection?: { id: string; status: string; instance_id: string } | null;
  recipients?: Array<ReturnType<typeof recipientRow>>;
  /** telefones que a lista negra responde como suprimidos (F09) */
  suppressedPhones?: string[];
  /** F09: simula opt-out que chega ENTRE o claim e o POST (1a checagem false, 2a true) */
  suppressAfterFirstCheck?: boolean;
  /** cota diaria restante da conexao (F17); null desliga a checagem */
  dailyRemaining?: number | null;
}

interface MockCtx {
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  limits: number[];
  completions: Array<Record<string, unknown>>;
  dispatch: DispatchRow | null;
  remaining: Array<ReturnType<typeof recipientRow>>;
  recipientSelects: number;
  suppressionChecks: number;
}

// Chainable query builder: a cadeia devolve o proprio builder e o builder e
// "thenable", entao `await supabase.from(t).select().eq()...` resolve pelo
// conteudo da tabela mockada (como o PostgREST devolveria).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableBuilder(table: string, opts: MockOpts, ctx: MockCtx): any {
  let limit: number | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (): { data: any; error: any } => {
    if (table === "multiplix_dispatches") return { data: ctx.dispatch, error: null };
    if (table === "multiplix_recipients") {
      ctx.recipientSelects++;
      return { data: ctx.remaining.slice(0, limit ?? 1000), error: null };
    }
    if (table === "whatsapp_connections") return { data: opts.connection ?? null, error: null };
    if (table === "profiles") return { data: opts.ownProfileId ? { id: opts.ownProfileId } : null, error: null };
    return { data: null, error: null };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  const chain = () => b;
  b.select = chain; b.eq = chain; b.in = chain; b.is = chain; b.or = chain;
  b.update = chain; b.insert = chain; b.order = chain; b.delete = chain;
  b.limit = (n: number) => { limit = n; ctx.limits.push(n); return b; };
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
    serviceKey: TEST_SERVICE_KEY,
    supabase: {
      rpc(name: string, args: Record<string, unknown> = {}) {
        ctx.rpcCalls.push({ name, args });
        switch (name) {
          case "get_multiplix_cron_secret":
            if (opts.cronVaultError) return Promise.resolve({ data: null, error: new Error("vault rpc failed") });
            return Promise.resolve({ data: opts.cronVaultResult ?? null, error: null });
          case "is_admin_or_supervisor":
            return Promise.resolve({ data: opts.isAdminOrSupervisor === true, error: null });
          case "user_has_permission":
            return Promise.resolve({ data: opts.manageAll === true, error: null });
          case "transition_multiplix_dispatch": {
            // Espelha o efeito no estado do mock para o motor enxergar a
            // transicao seguinte (ex.: pause -> 'paused').
            if (ctx.dispatch && args.p_action === "pause") ctx.dispatch = { ...ctx.dispatch, status: "paused" };
            if (ctx.dispatch && args.p_action === "start") ctx.dispatch = { ...ctx.dispatch, status: "sending" };
            return Promise.resolve({ data: [{ current_status: ctx.dispatch?.status ?? null }], error: null });
          }
          case "claim_multiplix_recipient":
            return Promise.resolve({ data: [{ claim_token: `claim-${String(args.p_recipient_id)}` }], error: null });
          case "complete_multiplix_recipient": {
            ctx.completions.push(args);
            ctx.remaining = ctx.remaining.filter((r) => r.id !== args.p_recipient_id);
            return Promise.resolve({ data: true, error: null });
          }
          case "talkx_recipient_is_suppressed": {
            ctx.suppressionChecks++;
            const listed = (opts.suppressedPhones ?? []).includes(String(args.p_phone ?? ""));
            const suppress = opts.suppressAfterFirstCheck ? ctx.suppressionChecks > 1 || listed : listed;
            return Promise.resolve({ data: suppress, error: null });
          }
          case "multiplix_connection_daily_usage": {
            const remaining = opts.dailyRemaining ?? 500;
            return Promise.resolve({ data: { limit: 500, sent: 500 - remaining, remaining }, error: null });
          }
          default:
            return Promise.resolve({ data: true, error: null });
        }
      },
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
        return tableBuilder(table, opts, ctx);
      },
    },
  };
}

function newCtx(opts: MockOpts): MockCtx {
  const dispatch = opts.dispatch === undefined ? dispatchRow() : opts.dispatch;
  // Sem conexao conectada o worker encerra com 409 antes de chegar no laco;
  // o default do mock e uma conexao viva para os testes do motor de envio.
  if (opts.connection === undefined) {
    opts.connection = { id: "conn-0001", status: "connected", instance_id: "instance-abc" };
  }
  return {
    rpcCalls: [],
    limits: [],
    completions: [],
    dispatch,
    remaining: [...(opts.recipients ?? [])],
    recipientSelects: 0,
    suppressionChecks: 0,
  };
}

// Stub do fetch para provar que nenhum POST de mensagem sai para o provedor.
function stubProviderFetch() {
  const urls: string[] = [];
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = ((input: any) => {
    urls.push(typeof input === "string" ? input : String(input?.url ?? input));
    return Promise.reject(new Error("provedor nao pode ser chamado neste teste"));
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    urls,
    messagePosts: () => urls.filter((url) => url.includes("/message/")).length,
    restore: () => { globalThis.fetch = original; },
  };
}

function rpcs(ctx: MockCtx, name: string) {
  return ctx.rpcCalls.filter((call) => call.name === name);
}

// ---------------------------------------------------------------- autenticação

Deno.test("auth: x-cron-secret correto → passa auth, chega no 404 de dispatch ausente", async () => {
  const opts: MockOpts = { cronVaultResult: TEST_CRON_SECRET, dispatch: null };
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 404, `esperado 404 (auth ok), recebido ${res.status}`);
});

Deno.test("auth: x-cron-secret errado → 401", async () => {
  const opts: MockOpts = { cronVaultResult: TEST_CRON_SECRET };
  const res = await handleMultiplixSend(makePost({ cronSecret: "wrong-secret-value" }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: vault RPC falha → fail-closed → 401 (não vaza secret inválido)", async () => {
  // Se o RPC de vault falhar, isCronAuth deve ficar false → nunca autorizar cron
  const opts: MockOpts = { cronVaultError: true };
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 401, `esperado 401 (fail-closed), recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: sem Authorization e sem x-cron-secret → 401", async () => {
  const opts: MockOpts = {};
  const res = await handleMultiplixSend(makePost({}), mockDeps(opts, newCtx(opts)));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: Bearer com service-role key correta → passa auth, chega no 404 de dispatch ausente", async () => {
  const opts: MockOpts = { dispatch: null };
  const res = await handleMultiplixSend(makePost({ bearer: TEST_SERVICE_KEY }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 404, `esperado 404 (auth ok via service key), recebido ${res.status}`);
});

Deno.test("auth: Bearer com JWT inválido (getUser retorna error) → 401", async () => {
  const opts: MockOpts = { authUserError: true };
  const res = await handleMultiplixSend(makePost({ bearer: "eyJinvalid.jwt.token" }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Unauthorized", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth: JWT sem admin/supervisor e sem manage_all → 403", async () => {
  const opts: MockOpts = { authUser: { id: "user-001" }, isAdminOrSupervisor: false, manageAll: false };
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden", `body inesperado: ${JSON.stringify(body)}`);
});

Deno.test("auth (F07): JWT com admin E supervisor passa — o papel vem do RPC, não de maybeSingle em user_roles", async () => {
  // Regressao: com as duas roles, .in(['admin','supervisor']).maybeSingle()
  // devolvia 2 linhas, o maybeSingle abortava e o admin+supervisor levava 403.
  const opts: MockOpts = {
    authUser: { id: "user-admin-001" },
    isAdminOrSupervisor: true,
    ownProfileId: "profile-me",
    dispatch: null,
  };
  const mock = mockDeps(opts, newCtx(opts));
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mock);
  assert(res.status === 404, `esperado 404 (auth ok), recebido ${res.status}`);
});

Deno.test("auth (F06): JWT sem admin/supervisor mas com multiplix.dispatch.manage_all → passa", async () => {
  const opts: MockOpts = {
    authUser: { id: "user-002" },
    isAdminOrSupervisor: false,
    manageAll: true,
    ownProfileId: "profile-me",
    dispatch: null,
  };
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mockDeps(opts, newCtx(opts)));
  assert(res.status === 404, `esperado 404 (auth ok via permissao nomeada), recebido ${res.status}`);
});

// ------------------------------------------------------------------ F06 (dono)

Deno.test("F06: admin pausa/cancela disparo de OUTRO dono → 403 (sem manage_all)", async () => {
  const opts: MockOpts = {
    authUser: { id: "user-003" },
    isAdminOrSupervisor: true,
    manageAll: false,
    ownProfileId: "profile-me",
    dispatch: dispatchRow({ status: "sending", created_by: "profile-outro" }),
  };
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(
    makePost({ bearer: TEST_JWT, body: { dispatchId: "00000000-0000-0000-0000-000000000001", action: "pause" } }),
    mockDeps(opts, ctx),
  );
  assert(res.status === 403, `esperado 403 (disparo de outro dono), recebido ${res.status}`);
  assert(rpcs(ctx, "transition_multiplix_dispatch").length === 0, "nao pode transicionar disparo de outro dono");
});

Deno.test("F06: dono do disparo inicia o proprio disparo → permitido", async () => {
  const opts: MockOpts = {
    authUser: { id: "user-004" },
    isAdminOrSupervisor: true,
    manageAll: false,
    ownProfileId: "profile-me",
    dispatch: dispatchRow({ status: "draft", created_by: "profile-me" }),
  };
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mockDeps(opts, ctx));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const start = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "start");
  assert(start, "esperava a transicao de start do proprio disparo");
});

Deno.test("F06: manage_all inicia disparo de outro dono → permitido", async () => {
  const opts: MockOpts = {
    authUser: { id: "user-005" },
    isAdminOrSupervisor: false,
    manageAll: true,
    ownProfileId: "profile-me",
    dispatch: dispatchRow({ status: "draft", created_by: "profile-outro" }),
  };
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mockDeps(opts, ctx));
  assert(res.status === 200, `esperado 200 (manage_all), recebido ${res.status}`);
  const start = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "start");
  assert(start, "esperava a transicao de start com manage_all");
});

// ------------------------------------------------------------------- F09 (opt-out)

Deno.test("F09: destinatário na lista negra vira 'skipped' com motivo, sem POST ao provedor", async () => {
  const phone = "5511988887777";
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending" }),
    recipients: [recipientRow(1, phone)],
    suppressedPhones: [phone],
  };
  const ctx = newCtx(opts);
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = (() => { providerCalls++; return Promise.reject(new Error("provider nao pode ser chamado")); }) as any;
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert(providerCalls === 0, `nenhum POST ao provedor era esperado, houve ${providerCalls}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(ctx.completions[0].p_status === "skipped", `status esperado 'skipped', veio ${ctx.completions[0].p_status}`);
  assert(
    ctx.completions[0].p_error_message === "Contato na lista negra (opt-out)",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});

// ------------------------------------------------------------------- F11a (lote)

Deno.test("F11a: fila maior que o lote drena em passadas de MULTIPLIX_BATCH_SIZE", async () => {
  const recipients = Array.from({ length: 25 }, (_, i) => recipientRow(i, `551190000${String(i).padStart(4, "0")}`));
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 25 }),
    recipients,
    // todos suprimidos: cada item e concluido como 'skipped' sem POST, o que
    // deixa a drenagem observavel sem depender do provedor.
    suppressedPhones: recipients.map((r) => String(r.destino_e164)),
  };
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(body.total === 25, `total esperado 25, veio ${body.total}`);
  assert(ctx.completions.length === 25, `esperava 25 conclusoes, recebeu ${ctx.completions.length}`);
  // 25 itens / lote 20 = 2 passadas cheias + 1 selecao vazia que encerra o laco.
  assert(ctx.limits.length === 3, `esperava 2 passadas cheias + 1 vazia, houve ${ctx.limits.length} selecoes limitadas`);
  assert(ctx.limits.every((n) => n === 20), `lote default deveria ser 20, veio ${JSON.stringify(ctx.limits)}`);
});

Deno.test("F11a: MULTIPLIX_BATCH_SIZE muda o tamanho do lote", async () => {
  const recipients = Array.from({ length: 25 }, (_, i) => recipientRow(i, `551191111${String(i).padStart(4, "0")}`));
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 25 }),
    recipients,
    suppressedPhones: recipients.map((r) => String(r.destino_e164)),
  };
  const ctx = newCtx(opts);
  Deno.env.set("MULTIPLIX_BATCH_SIZE", "5");
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    Deno.env.delete("MULTIPLIX_BATCH_SIZE");
  }
  assert(ctx.completions.length === 25, `esperava 25 conclusoes, recebeu ${ctx.completions.length}`);
  // 25 itens / lote 5 = 5 passadas cheias + 1 selecao vazia que encerra o laco.
  assert(ctx.limits.length === 6, `com lote 5 e 25 itens esperava 5 passadas + 1 vazia, houve ${ctx.limits.length}`);
  assert(ctx.limits.every((n) => n === 5), `lote esperado 5, veio ${JSON.stringify(ctx.limits)}`);
});

// ---------------------------------------------------------- F17 (cota diária)

Deno.test("F17: sem cota diária sobrando o disparo é pausado com motivo 'daily_limit'", async () => {
  const phone = "5511977776666";
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending" }),
    recipients: [recipientRow(1, phone)],
    suppressedPhones: [],
    dailyRemaining: 0,
  };
  const ctx = newCtx(opts);
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = (() => { providerCalls++; return Promise.reject(new Error("provider nao pode ser chamado")); }) as any;
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const pause = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "pause");
  assert(pause, "esperava a pausa automatica do disparo");
  assert(pause.args.p_pause_reason === "daily_limit", `motivo esperado 'daily_limit', veio ${pause.args.p_pause_reason}`);
  assert(rpcs(ctx, "claim_multiplix_recipient").length === 0, "nao deveria reivindicar destinatario sem cota");
  assert(providerCalls === 0, `nenhum POST ao provedor era esperado, houve ${providerCalls}`);
});

Deno.test("F17: com cota sobrando o disparo segue (não pausa por cota)", async () => {
  const phone = "5511966665555";
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending" }),
    recipients: [recipientRow(1, phone)],
    suppressedPhones: [phone],
    dailyRemaining: 10,
  };
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const quotaPause = rpcs(ctx, "transition_multiplix_dispatch")
    .find((call) => call.args.p_action === "pause" && call.args.p_pause_reason === "daily_limit");
  assert(!quotaPause, "nao deveria pausar por cota diaria com espaco disponivel");
  assert(rpcs(ctx, "claim_multiplix_recipient").length === 1, "esperava reivindicar o destinatario");
});

// --------------------------------------------------- F06 (start) e F09 (janela)

Deno.test("F06: admin sem manage_all inicia disparo de OUTRO dono → 403", async () => {
  const opts: MockOpts = {
    authUser: { id: "user-006" },
    isAdminOrSupervisor: true,
    manageAll: false,
    ownProfileId: "profile-me",
    dispatch: dispatchRow({ status: "draft", created_by: "profile-outro" }),
  };
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mockDeps(opts, ctx));
  assert(res.status === 403, `esperado 403 (start de disparo de outro dono), recebido ${res.status}`);
  assert(rpcs(ctx, "transition_multiplix_dispatch").length === 0, "nao pode iniciar disparo de outro dono");
});

Deno.test("F09: opt-out que chega ENTRE o claim e o POST também barra o envio", async () => {
  // Prova que a checagem imediatamente antes do POST existe: a primeira
  // (logo apos o claim) responde 'nao suprimido' e a segunda responde
  // 'suprimido' — o destinatario tem de virar 'skipped' sem POST de mensagem.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending" }),
    recipients: [recipientRow(1, "5511955554444")],
    suppressedPhones: [],
    suppressAfterFirstCheck: true,
  };
  const ctx = newCtx(opts);
  const provider = stubProviderFetch();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    provider.restore();
  }
  assert(ctx.suppressionChecks >= 2, `esperava 2 checagens de supressao, houve ${ctx.suppressionChecks}`);
  assert(provider.messagePosts() === 0, `nenhum POST /message/ era esperado, houve ${provider.messagePosts()}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(ctx.completions[0].p_status === "skipped", `status esperado 'skipped', veio ${ctx.completions[0].p_status}`);
  assert(
    ctx.completions[0].p_error_message === "Contato na lista negra (opt-out)",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});
