import { handleMultiplixSend, personalize } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('personalize resolve {{empresa}} com o nome da empresa', () => {
  const result = personalize('Ola, aqui é da {{empresa}}', { company: 'Empresa Teste' }).text;
  assert(result === 'Ola, aqui é da Empresa Teste', `unexpected result: ${result}`);
});

Deno.test('personalize resolve {{saudacao}} para um período válido do dia', () => {
  // getGreeting() usa a hora real — só valida que retorna uma das 3 saudações
  // esperadas, sem travar o teste a um horário fixo de execução do CI.
  const result = personalize('{{saudacao}}, {{empresa}}!', { company: 'Acme' }).text;
  const validGreetings = ['Bom dia, Acme!', 'Boa tarde, Acme!', 'Boa noite, Acme!'];
  assert(validGreetings.includes(result), `unexpected greeting result: ${result}`);
});

Deno.test('personalize usa string vazia quando company é ausente/null (built-in {{empresa}} sem valor)', () => {
  // Comportamento do kernel para um built-in SEM valor: {{empresa}} resolve para
  // '' — o fallback "[variavel]" cobre apenas chaves FORA do conjunto de
  // built-ins. Idêntico ao antigo personalizeMultiplix; nada a corrigir aqui.
  const result = personalize('Empresa: {{empresa}}', {}).text;
  assert(result === 'Empresa: ', `unexpected result: ${result}`);
});

Deno.test('personalize usa fallback [variavel] para placeholder fora do conjunto fixo (nunca lança)', () => {
  // MUDANÇA DE POLÍTICA do F37 (o caso que o plano manda corrigir): o kernel
  // NUNCA lança unknown_placeholder. Uma variável sem valor — {{cargo}}, que o
  // Multiplix não resolve — vira "[cargo]" em vez de derrubar o envio do
  // destinatário inteiro. O dialeto antigo (personalizeMultiplix) lançava.
  const result = personalize('Seu cargo é {{cargo}}', { company: 'Acme' }).text;
  assert(result === 'Seu cargo é [cargo]', `unexpected result: ${result}`);
});

Deno.test('personalize é case-insensitive nos placeholders conhecidos', () => {
  const result = personalize('{{SAUDACAO}}, {{Empresa}}!', { company: 'Acme' }).text;
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
  /** Auditoria adversarial 29/09: supressao detectada SOMENTE na 1a checagem
   * (o 1o ponto tem de barrar sozinho) — mata o mutante M08. */
  suppressOnlyFirstCheck?: boolean;
  /** Auditoria adversarial 29/09: a RPC de supressao responde ERRO — o envio
   * tem de seguir fail-closed (mata o fail-open do mutante M25). */
  suppressionRpcError?: boolean;
  blockContent?: Record<string, unknown>;
  /** cota diaria restante da conexao (F17); null desliga a checagem */
  dailyRemaining?: number | null;
  /** F11a: reivindicacao que nao devolve token (lease de outro worker) */
  claimReturnsNothing?: boolean;
  /** F10: a janela de envio fecha logo depois do start (disparo em andamento) */
  windowClosesAfterStart?: boolean;
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
      // Rede de seguranca do teste: sem o "passada sem reivindicacao encerra o
      // laco" o worker re-seleciona a mesma fila para sempre e o teste ficaria
      // pendurado (o laco vive de promessas ja resolvidas, sem ceder ao timer).
      // Estourar aqui faz o teste FALHAR em vez de travar o CI.
      if (ctx.recipientSelects > 12) throw new Error("laco do worker nao encerrou (selecoes repetidas)");
      return { data: ctx.remaining.slice(0, limit ?? 1000), error: null };
    }
    // F55: o worker nao le mais item por SELECT — a escolha vem da RPC
    // list_multiplix_claimable_items. Esta leitura existe so para os detalhes de envio
    // (destino, nome da empresa, conteudo do bloco), e o stub devolve o destinatario da
    // fila embrulhado nos dois relacionamentos, que e a forma que o worker consome.
    if (table === "multiplix_delivery_items") {
      const alvo = ctx.remaining[0];
      if (!alvo) return { data: null, error: null };
      return {
        data: {
          id: `item-${String(alvo.id)}`,
          recipient_id: alvo.id,
          block_id: "block-1",
          attempt_count: alvo.attempt_count ?? 0,
          status: "sending",
          recipient: alvo,
          block: { id: "block-1", block_order: 0, content: opts.blockContent ?? {} },
        },
        error: null,
      };
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
            if (ctx.dispatch && args.p_action === "start") {
              ctx.dispatch = { ...ctx.dispatch, status: "sending" };
              if (opts.windowClosesAfterStart) {
                // Janela malformada = recusa garantida em qualquer horario.
                ctx.dispatch = { ...ctx.dispatch, send_window_start: "8h", send_window_end: "18h" };
              }
            }
            return Promise.resolve({ data: [{ current_status: ctx.dispatch?.status ?? null }], error: null });
          }
          // F55: a ESCOLHA vem daqui. Devolve a fila embrulhada como item — o id do item e
          // derivado do id do destinatario para o resto do stub continuar casando.
          case "list_multiplix_claimable_items":
            // O tamanho do lote agora e o p_limit desta RPC, nao um .limit() de SELECT. As
            // assercoes do F11a (que sempre perguntaram "qual o tamanho do lote") continuam
            // valendo sem reescrita porque o stub registra o mesmo valor no mesmo lugar.
            ctx.limits.push(Number(args.p_limit ?? 20));
            ctx.recipientSelects++;
            if (ctx.recipientSelects > 12) throw new Error("laco do worker nao encerrou (selecoes repetidas)");
            // claimReturnsNothing e sobre o CLAIM, nao sobre a lista: a fila existe (o worker
            // tenta reivindicar), mas outro worker levou o item. Antes do F55 isso caia no
            // SELECT; agora a lista entrega e o claim e que recusa.
            return Promise.resolve({
              data: ctx.remaining.slice(0, Number(args.p_limit ?? 20)).map((r) => ({
                item_id: `item-${String(r.id)}`,
                recipient_id: r.id,
                block_id: "block-1",
                block_order: 0,
                company_id: r.company_id,
                attempt_count: r.attempt_count ?? 0,
                next_attempt_at: null,
              })),
              error: null,
            });
          case "claim_multiplix_item":
            if (opts.claimReturnsNothing) return Promise.resolve({ data: [], error: null });
            return Promise.resolve({ data: [{ claim_token: `claim-${String(args.p_item_id)}` }], error: null });
          case "persist_multiplix_item_message_snapshot":
            // Fiel ao banco: a RPC grava o texto e devolve a string personalizada. O stub
            // nao a implementava, entao devolvia undefined e o texto enviado era undefined
            // — invisivel enquanto o POST nao validava; o adaptador (F56) valida.
            return Promise.resolve({ data: String(args.p_personalized_message ?? ""), error: null });
          case "complete_multiplix_item": {
            ctx.completions.push(args);
            const id = String(args.p_item_id).replace(/^item-/, "");
            ctx.remaining = ctx.remaining.filter((r) => r.id !== id);
            return Promise.resolve({ data: true, error: null });
          }
          case "record_multiplix_item_sent": {
            // Espelha o efeito no banco: quem foi enviado sai da fila de
            // 'pending' (sem isso o worker re-seleciona o mesmo destinatario e a
            // rede de seguranca do mock derruba o teste por laco infinito).
            const id = String(args.p_item_id).replace(/^item-/, "");
            ctx.remaining = ctx.remaining.filter((r) => r.id !== id);
            return Promise.resolve({ data: true, error: null });
          }
          case "talkx_recipient_is_suppressed": {
            ctx.suppressionChecks++;
            if (opts.suppressionRpcError) {
              // Auditoria adversarial: erro/invalidacao da RPC de supressao — o
              // worker precisa falhar fechado (nao enviar), nunca liberar envio.
              return Promise.resolve({ data: null, error: new Error("suppression rpc failed") });
            }
            const listed = (opts.suppressedPhones ?? []).includes(String(args.p_phone ?? ""));
            const suppress = opts.suppressOnlyFirstCheck
              ? ctx.suppressionChecks === 1
              : opts.suppressAfterFirstCheck ? ctx.suppressionChecks > 1 || listed : listed;
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
    messagePosts: () =>
      urls.filter((url) => url.includes("/message/") && !url.includes("presence")).length,
    restore: () => { globalThis.fetch = original; },
  };
}

function rpcs(ctx: MockCtx, name: string) {
  return ctx.rpcCalls.filter((call) => call.name === name);
}

/** Roda o handler com o provedor BLOQUEADO (qualquer POST derruba o teste) e
 * devolve o contexto do mock — evita repetir o mesmo try/finally em cada caso. */
async function runWithProviderBlocked(opts: MockOpts): Promise<{ ctx: MockCtx; providerPosts: number }> {
  const ctx = newCtx(opts);
  const provider = stubProviderFetch();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    return { ctx, providerPosts: provider.messagePosts() };
  } finally {
    provider.restore();
  }
}

/** Provedor respondendo com sucesso (v2 devolve key.id): permite exercitar o
 * caminho de envio concluido sem rede — e o unico jeito de a cota diaria ser
 * consumida, ja que ela so cai no envio que conclui. */
/** PNG 1x1: bytes magicos reais para o prepareMedia (F40) reconhecer o tipo. */
const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

/** Provedor que responde JSON de sucesso E serve bytes quando a URL e a midia do teste. */
/** Bytes magicos de PDF (%PDF-1.4), para o prepareMedia classificar como documento. */
const PDF_MINIMO = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");

/** Bytes magicos de OGG (OggS), o container das notas de voz. */
const OGG_MINIMO = new Uint8Array([
  0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x1e, 0x01, 0x76, 0x6f, 0x72, 0x62, 0x69,
  0x73, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

function stubProviderComMidia(id = "WAMID-TESTE-1") {
  const urls: string[] = [];
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = ((input: any, initArg?: { body?: string }) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    urls.push(url);
    const init = initArg ?? (input?.init as { body?: string } | undefined);
    if (url.includes("/message/") || url.endsWith("/send/media") || url.endsWith("/send/text")) {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      } catch {
        body = {};
      }
      posts.push({ url, body });
    }
    if (url.includes(".ogg")) {
      return Promise.resolve(
        new Response(OGG_MINIMO, { status: 200, headers: { "content-type": "audio/ogg" } }),
      );
    }
    if (url.includes(".pdf")) {
      return Promise.resolve(
        new Response(PDF_MINIMO, { status: 200, headers: { "content-type": "application/pdf" } }),
      );
    }
    if (url.includes("exemplo.test")) {
      return Promise.resolve(
        new Response(PNG_1X1, { status: 200, headers: { "content-type": "image/png" } }),
      );
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ key: { id } }),
    });
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { urls, posts, restore: () => { globalThis.fetch = original; } };
}

function stubProviderSuccess(id = "WAMID-TESTE-1") {
  const urls: string[] = [];
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = ((input: any) => {
    urls.push(typeof input === "string" ? input : String(input?.url ?? input));
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ key: { id } }),
    });
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    urls,
    restore: () => { globalThis.fetch = original; },
  };
}

/** Opcoes de um disparo em 'sending' com a fila toda suprimida: cada item vira
 * 'skipped' sem POST, o que deixa a drenagem do lote observavel sem provedor. */
function batchSendingOpts(phonePrefix: string, length = 25): MockOpts {
  const recipients = Array.from({ length }, (_, i) => recipientRow(i, `${phonePrefix}${String(i).padStart(4, "0")}`));
  return {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: length }),
    recipients,
    suppressedPhones: recipients.map((r) => String(r.destino_e164)),
  };
}

/** Opcoes base de um disparo em 'draft' visto por um JWT (fluxo de start). */
function startRequestOpts(overrides: Partial<MockOpts> = {}): MockOpts {
  return {
    authUser: { id: "user-000" },
    isAdminOrSupervisor: false,
    manageAll: false,
    ownProfileId: "profile-me",
    dispatch: dispatchRow({ status: "draft", created_by: "profile-me" }),
    ...overrides,
  };
}

/** Roda o handler com um POST autenticado por JWT (start/gestao) e devolve ctx + status. */
async function runWithJwt(opts: MockOpts): Promise<{ ctx: MockCtx; status: number }> {
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ bearer: TEST_JWT }), mockDeps(opts, ctx));
  return { ctx, status: res.status };
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
  const { ctx, status } = await runWithJwt(startRequestOpts({ authUser: { id: "user-004" }, isAdminOrSupervisor: true }));
  assert(status === 200, `esperado 200, recebido ${status}`);
  const start = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "start");
  assert(start, "esperava a transicao de start do proprio disparo");
});

Deno.test("F06: manage_all inicia disparo de outro dono → permitido", async () => {
  const { ctx, status } = await runWithJwt(startRequestOpts({
    authUser: { id: "user-005" },
    manageAll: true,
    dispatch: dispatchRow({ status: "draft", created_by: "profile-outro" }),
  }));
  assert(status === 200, `esperado 200 (manage_all), recebido ${status}`);
  const start = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "start");
  assert(start, "esperava a transicao de start com manage_all");
});

Deno.test("F06 (bug 01/10/2026): admin COM multiplix.dispatch.manage_all inicia disparo de OUTRO dono → permitido", async () => {
  // Regressao medida: a permissao nomeada era consultada SO quando
  // is_admin_or_supervisor era falso. Um admin que TINHA a permissao nunca
  // era reconhecido — o gate de papel passava, hasManageAll continuava false e
  // o start no disparo alheio voltava 403.
  const { ctx, status } = await runWithJwt(startRequestOpts({
    authUser: { id: "user-006" },
    isAdminOrSupervisor: true,
    manageAll: true,
    dispatch: dispatchRow({ status: "draft", created_by: "profile-outro" }),
  }));
  assert(status === 200, `esperado 200 (admin com manage_all), recebido ${status}`);
  assert(
    rpcs(ctx, "transition_multiplix_dispatch").some((call) => call.args.p_action === "start"),
    "esperava a transicao de start do disparo alheio com manage_all",
  );
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
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(providerPosts === 0, `nenhum POST ao provedor era esperado, houve ${providerPosts}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(ctx.completions[0].p_status === "skipped", `status esperado 'skipped', veio ${ctx.completions[0].p_status}`);
  assert(
    ctx.completions[0].p_error_message === "Contato na lista negra (opt-out)",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});

// ------------------------------------------------------------------- F11a (lote)

Deno.test("F11a: uma invocacao processa UM lote (MULTIPLIX_BATCH_SIZE) e devolve a vez ao cron", async () => {
  // Contrato alterado em 01/10/2026: antes o `passLoop: for(;;)` drenava o
  // publico inteiro numa unica invocacao — a edge ficava aberta por horas (e
  // estourava o limite de tempo). Agora cada invocacao processa UM lote e
  // retorna; o cron `multiplix-send-trigger` (a cada 2 min) reinvoca.
  const opts = batchSendingOpts("551190000");
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(body.total === 20, `total esperado 20 (um lote de 25 disponiveis), veio ${body.total}`);
  assert(ctx.completions.length === 20, `esperava 20 conclusoes, recebeu ${ctx.completions.length}`);
  assert(ctx.limits.length === 1, `esperava 1 unica selecao limitada, houve ${ctx.limits.length}`);
  assert(ctx.limits[0] === 20, `lote default deveria ser 20, veio ${JSON.stringify(ctx.limits)}`);
  // Nao afirmamos body.completed aqui: o mock devolve true fixo para
  // complete_multiplix_dispatch_if_drained — quem decide "concluido" e a funcao
  // SQL, coberta pelos testes da F13. O que prova o lote unico e o teto de 20
  // conclusoes acima, com 25 itens disponiveis na fila.
});

Deno.test("F11a: MULTIPLIX_BATCH_SIZE muda o tamanho do lote", async () => {
  const opts = batchSendingOpts("551191111");
  const ctx = newCtx(opts);
  Deno.env.set("MULTIPLIX_BATCH_SIZE", "5");
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    Deno.env.delete("MULTIPLIX_BATCH_SIZE");
  }
  assert(ctx.completions.length === 5, `esperava 5 conclusoes (um lote), recebeu ${ctx.completions.length}`);
  assert(ctx.limits.length === 1, `esperava 1 unica selecao limitada, houve ${ctx.limits.length}`);
  assert(ctx.limits[0] === 5, `lote esperado 5, veio ${JSON.stringify(ctx.limits)}`);
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
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  const pause = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "pause");
  assert(pause, "esperava a pausa automatica do disparo");
  assert(pause.args.p_pause_reason === "daily_limit", `motivo esperado 'daily_limit', veio ${pause.args.p_pause_reason}`);
  assert(rpcs(ctx, "claim_multiplix_item").length === 0, "nao deveria reivindicar destinatario sem cota");
  assert(providerPosts === 0, `nenhum POST ao provedor era esperado, houve ${providerPosts}`);
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
  assert(rpcs(ctx, "claim_multiplix_item").length === 1, "esperava reivindicar o destinatario");
});

Deno.test("F17: a cota da conexão é consumida por envio concluído (1 enviado, depois pausa o lote)", async () => {
  // Cota de 1 e dois destinatarios na mesma passada: o primeiro envio conclui e
  // consome a cota; o segundo tem de encontrar dailyRoom <= 0 e virar pausa por
  // daily_limit — sem reivindicar (nao queima destinatario).
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 2 }),
    recipients: [recipientRow(1, "5511944443333"), recipientRow(2, "5511944442222")],
    suppressedPhones: [],
    dailyRemaining: 1,
  };
  const ctx = newCtx(opts);
  const provider = stubProviderSuccess();
  // O default do shared e o flavor "go", que troca a rota e exige token de
  // instancia (o worker chama evoFetch sem instanceToken). Em "v2" o path passa
  // direto para o fetch e o caminho de envio concluido fica observavel.
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    Deno.env.delete("EVOLUTION_API_FLAVOR");
    provider.restore();
  }
  assert(
    rpcs(ctx, "record_multiplix_item_sent").length === 1,
    `esperava 1 envio concluido, houve ${rpcs(ctx, "record_multiplix_item_sent").length}`,
  );
  const pause = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "pause");
  assert(pause, "esperava pausa por cota depois de consumir o unico envio do dia");
  assert(pause.args.p_pause_reason === "daily_limit", `motivo esperado 'daily_limit', veio ${pause.args.p_pause_reason}`);
  assert(
    rpcs(ctx, "claim_multiplix_item").length === 1,
    `esperava 1 reivindicacao (a cota acaba depois dela), houve ${rpcs(ctx, "claim_multiplix_item").length}`,
  );
});

// ------------------------------------------------------------------- F10 (janela)

Deno.test("F10: start fora da janela não dispara nada (ok:false, sem pausa e sem claim)", async () => {
  // "8h" nao e HH:MM: o helper falha FECHADO (recusa). Antes do laco o worker
  // devolve ok:false com o motivo — o disparo nem sai de 'draft'/'scheduled'.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", send_window_start: "8h", send_window_end: "18h" }),
    recipients: [recipientRow(1, "5511922221111")],
    suppressedPhones: [],
  };
  const ctx = newCtx(opts);
  const provider = stubProviderFetch();
  let body: { ok?: boolean; reason?: string } = {};
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    body = await res.json();
  } finally {
    provider.restore();
  }
  assert(body.ok === false, `esperava ok:false, veio ${JSON.stringify(body)}`);
  assert(body.reason === "outside_send_window", `motivo esperado 'outside_send_window', veio ${body.reason}`);
  assert(rpcs(ctx, "claim_multiplix_item").length === 0, "nao pode reivindicar fora da janela");
  assert(provider.messagePosts() === 0, "nao pode enviar fora da janela");
});

Deno.test("F10: janela que fecha no meio do disparo pausa com motivo 'outside_window'", async () => {
  // O laco refaz a checagem de janela a cada destinatario: se ela fecha durante
  // o disparo, o worker pausa com o motivo que o cron sabe retomar (sem isso o
  // disparo ficava pausado para sempre sem ninguem saber por que).
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending" }),
    recipients: [recipientRow(1, "5511922222222")],
    suppressedPhones: [],
    windowClosesAfterStart: true,
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  const pause = rpcs(ctx, "transition_multiplix_dispatch").find((call) => call.args.p_action === "pause");
  assert(pause, "esperava pausa quando a janela fecha no meio do disparo");
  assert(pause.args.p_pause_reason === "outside_window", `motivo esperado 'outside_window', veio ${pause.args.p_pause_reason}`);
  assert(rpcs(ctx, "claim_multiplix_item").length === 0, "nao pode reivindicar com a janela fechada");
  assert(providerPosts === 0, "nao pode enviar com a janela fechada");
});

// ------------------------------------------------------------------- F11a (laco)

Deno.test("F11a: passada sem reivindicação encerra o laço (não gira contra a fila)", async () => {
  // Reivindicacao vazia (lease de outro worker) tem de terminar a passada: sem
  // isso o worker re-seleciona a mesma fila indefinidamente contra o banco.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511911110000")],
    claimReturnsNothing: true,
  };
  const ctx = newCtx(opts);
  const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(
    rpcs(ctx, "claim_multiplix_item").length === 1,
    `esperava 1 tentativa de reivindicacao, houve ${rpcs(ctx, "claim_multiplix_item").length}`,
  );
  assert(
    ctx.recipientSelects === 1,
    `a passada sem reivindicacao deveria encerrar o laco na 1a selecao, houve ${ctx.recipientSelects}`,
  );
});

// --------------------------------------------------- F06 (start) e F09 (janela)

Deno.test("F06: admin sem manage_all inicia disparo de OUTRO dono → 403", async () => {
  const { ctx, status } = await runWithJwt(startRequestOpts({
    authUser: { id: "user-006" },
    isAdminOrSupervisor: true,
    dispatch: dispatchRow({ status: "draft", created_by: "profile-outro" }),
  }));
  assert(status === 403, `esperado 403 (start de disparo de outro dono), recebido ${status}`);
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
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(ctx.suppressionChecks >= 2, `esperava 2 checagens de supressao, houve ${ctx.suppressionChecks}`);
  assert(providerPosts === 0, `nenhum POST /message/ era esperado, houve ${providerPosts}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(ctx.completions[0].p_status === "skipped", `status esperado 'skipped', veio ${ctx.completions[0].p_status}`);
  assert(
    ctx.completions[0].p_error_message === "Contato na lista negra (opt-out)",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});

// ---------------------------------------------------------------------------
// Gaps fechados na auditoria adversarial de 29/09/2026.
// Cada teste abaixo FALHA se o mutante correspondente voltar ao worker — eram
// exatamente os pontos em que a suite ficava verde com o comportamento quebrado
// (27 de 40 mutantes sobreviviam). O id do mutante vive no nome do teste; o
// criterio de morte e por ASSERCAO (ver scripts/db-audit/multiplix-send-mutation.py).
// ---------------------------------------------------------------------------

Deno.test("gap M08: o 1o ponto de supressao barra sozinho (nao basta contar checagens)", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550001")],
    suppressOnlyFirstCheck: true,
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(providerPosts === 0, `supressao do 1o ponto nao pode gerar POST /message/, houve ${providerPosts}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(
    ctx.completions[0].p_status === "skipped",
    `status esperado 'skipped' (barrado no 1o ponto), veio ${ctx.completions[0].p_status}`,
  );
});

Deno.test("gap M13: a cota diaria e consultada com o connection_id da conexao do dispatch", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", whatsapp_connection_id: "conn-0001", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550002")],
  };
  const { ctx } = await runWithProviderBlocked(opts);
  const calls = rpcs(ctx, "multiplix_connection_daily_usage");
  assert(calls.length >= 1, "o worker nao consultou a cota diaria da conexao");
  assert(
    calls[0].args.p_connection_id === "conn-0001",
    `cota consultada com connection_id '${String(calls[0].args.p_connection_id)}' em vez do dispatch`,
  );
});

Deno.test("gap M16/M18: MULTIPLIX_BATCH_SIZE hostil nao fura o teto de 200 nem o default 20", async () => {
  const anterior = Deno.env.get("MULTIPLIX_BATCH_SIZE");
  try {
    Deno.env.set("MULTIPLIX_BATCH_SIZE", "999999999");
    const { ctx: ctxAlto } = await runWithProviderBlocked(batchSendingOpts("551195556"));
    assert(ctxAlto.limits.length >= 1, "o worker nao selecionou lote (nenhum .limit() observado)");
    assert(
      Math.max(...ctxAlto.limits) === 200,
      `teto esperado 200 com MULTIPLIX_BATCH_SIZE=999999999, veio ${Math.max(...ctxAlto.limits)}`,
    );

    Deno.env.set("MULTIPLIX_BATCH_SIZE", "abc");
    const { ctx: ctxHostil } = await runWithProviderBlocked(batchSendingOpts("551195557"));
    assert(
      Math.max(...ctxHostil.limits) === 20,
      `default esperado 20 com MULTIPLIX_BATCH_SIZE invalido, veio ${Math.max(...ctxHostil.limits)}`,
    );
  } finally {
    if (anterior === undefined) Deno.env.delete("MULTIPLIX_BATCH_SIZE");
    else Deno.env.set("MULTIPLIX_BATCH_SIZE", anterior);
  }
});

Deno.test("gap M25: erro na RPC de supressao nao libera envio (fail-closed)", async () => {
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550003")],
    suppressionRpcError: true,
  };
  const ctx = newCtx(opts);
  const provider = stubProviderFetch();
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    // Fail-closed: supressao ilegivel aborta a passada (500 observavel) em vez de
    // enviar para quem pode ter pedido opt-out.
    assert(res.status === 500, `esperado 500 (fail-closed), recebido ${res.status}`);
    assert(provider.messagePosts() === 0, `supressao ilegivel nao pode gerar POST, houve ${provider.messagePosts()}`);
    const enviados = ctx.completions.filter((c) => c.p_status === "sent");
    assert(enviados.length === 0, "nenhum destinatario pode ser marcado 'sent' com a supressao ilegivel");
  } finally {
    provider.restore();
  }
});

Deno.test("gap M32: dispatch com midia usa o endpoint de midia (nao sendText)", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  // Sem flavor explicito o evoFetch traduz para EVOLUTION GO e, sem token de
  // instancia, devolve 400 sem chamar o provedor — o POST so e observavel em v2.
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({
      status: "sending",
      media_type: "image",
      media_url: "https://exemplo.test/foto.png",
      total_recipients: 1,
    }),
    recipients: [recipientRow(1, "5511955550004")],
  };
  const ctx = newCtx(opts);
  // F56: o envio de midia passa pelo prepareMedia, que BUSCA o arquivo para detectar o
  // tipo real. O stub precisa servir bytes de verdade — com o stub de JSON a midia e
  // recusada como invalida e nenhum POST sai.
  const provider = stubProviderComMidia();
  try {
    await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    const posts = provider.urls.filter((url) => url.includes("/message/"));
    assert(posts.length >= 1, `esperava POST ao provedor, urls observadas: ${JSON.stringify(provider.urls)}`);
    assert(
      posts.some((url) => url.includes("sendMedia")),
      `endpoint de midia esperado no POST, veio: ${JSON.stringify(posts)}`,
    );
    assert(
      posts.every((url) => !url.includes("sendText")),
      `dispatch com midia nao pode usar sendText, veio: ${JSON.stringify(posts)}`,
    );
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

Deno.test("envio bem-sucedido: WAMID do provedor vira 'sent' com external_id registrado", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "5511955550005")],
  };
  const ctx = newCtx(opts);
  const provider = stubProviderSuccess("WAMID-TESTE-1");
  try {
    const res = await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
    const posts = provider.urls.filter((url) => url.includes("/message/sendText/"));
    assert(posts.length === 1, `esperava 1 POST sendText, urls: ${JSON.stringify(provider.urls)}`);
    const registrados = rpcs(ctx, "record_multiplix_item_sent");
    assert(registrados.length === 1, `esperava 1 registro de envio, houve ${registrados.length}`);
    assert(
      registrados[0].args.p_external_id === "WAMID-TESTE-1",
      `external_id inesperado: ${String(registrados[0].args.p_external_id)}`,
    );
    const corpo = await res.json();
    assert(corpo?.sent === 1, `resposta deveria reportar sent=1, veio ${JSON.stringify(corpo)}`);
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

// ------------------------------------------------------------------- F38 (E.164)

Deno.test("F38: destino invalido (possivel LID de 14 digitos) vira 'skipped' no_destination, sem POST", async () => {
  // normalizePhone do kernel recusa 14-15 digitos nus (possivel LID). Antes o
  // `replace(/\\D/g)` da L437 empurrava essa string direto ao provedor; agora o
  // destino cai na classe `no_destination` (F39) e o item nao e enviado.
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 1 }),
    recipients: [recipientRow(1, "12345678901234")],
    suppressedPhones: [],
  };
  const { ctx, providerPosts } = await runWithProviderBlocked(opts);
  assert(providerPosts === 0, `nenhum POST ao provedor era esperado, houve ${providerPosts}`);
  assert(ctx.completions.length === 1, `esperava 1 conclusao, recebeu ${ctx.completions.length}`);
  assert(
    ctx.completions[0].p_status === "skipped",
    `status esperado 'skipped' (no_destination), veio ${ctx.completions[0].p_status}`,
  );
  assert(
    ctx.completions[0].p_error_message === "Sem destino de WhatsApp",
    `motivo inesperado: ${ctx.completions[0].p_error_message}`,
  );
});

Deno.test("gap M12/F17: a cota diaria e consumida por envio (remaining=1 -> 1 envio e pausa)", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({ status: "sending", total_recipients: 2 }),
    recipients: [recipientRow(1, "5511955550006"), recipientRow(2, "5511955550007")],
    dailyRemaining: 1,
  };
  const ctx = newCtx(opts);
  const provider = stubProviderSuccess();
  try {
    await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    const envios = rpcs(ctx, "record_multiplix_item_sent");
    assert(envios.length === 1, `cota de 1 deveria permitir 1 envio, houve ${envios.length}`);
    // F56: o envio manda PRESENCA antes da mensagem. A presenca nao pode contar como
    // envio — senao a cota pareceria consumida duas vezes.
    const posts = provider.urls.filter((url) => url.includes("/message/") && !url.includes("presence"));
    assert(posts.length === 1, `esperava 1 POST ao provedor, houve ${posts.length}`);
    const pausas = rpcs(ctx, "transition_multiplix_dispatch").filter((c) => c.args.p_action === "pause");
    assert(pausas.length === 1, `esperava 1 pausa por cota esgotada, houve ${pausas.length}`);
    assert(
      pausas[0].args.p_pause_reason === "daily_limit",
      `motivo da pausa esperado 'daily_limit', veio '${String(pausas[0].args.p_pause_reason)}'`,
    );
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

Deno.test("F56: documento sai com o fileName do bloco (o PDF chega com nome)", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({
      status: "sending",
      media_type: "document",
      media_url: "https://exemplo.test/contrato.pdf",
      total_recipients: 1,
    }),
    recipients: [recipientRow(1, "5511955550008")],
    // F33: o nome do arquivo vive no content do bloco, e e a unica fonte dele —
    // a URL assinada do bucket nao preserva o nome.
    blockContent: { media: { url: "https://exemplo.test/contrato.pdf", fileName: "Contrato Assinado.pdf" } },
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComMidia();
  try {
    await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    const midia = provider.posts.filter((p) => p.url.includes("sendMedia"));
    assert(midia.length === 1, `esperava 1 POST de midia, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
    assert(
      midia[0].body.fileName === "Contrato Assinado.pdf",
      `o documento tem de sair com o nome do bloco, saiu: ${String(midia[0].body.fileName)}`,
    );
    assert(
      midia[0].body.mediatype === "document",
      `tipo real (detectado nos bytes) esperado document, veio ${String(midia[0].body.mediatype)}`,
    );
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});

Deno.test("F56: audio do dispatch sai como PTT e avisa presenca 'recording'", async () => {
  const flavorAnterior = Deno.env.get("EVOLUTION_API_FLAVOR");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const opts: MockOpts = {
    cronVaultResult: TEST_CRON_SECRET,
    dispatch: dispatchRow({
      status: "sending",
      media_type: "audio",
      media_url: "https://exemplo.test/nota.ogg",
      total_recipients: 1,
    }),
    recipients: [recipientRow(1, "5511955550009")],
  };
  const ctx = newCtx(opts);
  const provider = stubProviderComMidia();
  try {
    await handleMultiplixSend(makePost({ cronSecret: TEST_CRON_SECRET }), mockDeps(opts, ctx));
    const presenca = provider.posts.find((p) => p.url.includes("presence"));
    assert(presenca !== undefined, `esperava POST de presenca, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
    // O Evolution GO nao expressa "gravando" como presence:"recording": translateV2ToGo
    // converte para { state: "composing", isAudio: true }. A assercao aceita as duas formas
    // — o que importa e a INTENCAO (o destinatario ve que e audio), nao o dialeto da vez.
    const avisaGravacao = presenca.body.isAudio === true || presenca.body.presence === "recording";
    assert(
      avisaGravacao,
      `nota de voz tem de avisar gravacao, veio: ${JSON.stringify(presenca.body)}`,
    );
    const audio = provider.posts.find((p) => p.url.includes("audio") || p.url.includes("sendWhatsAppAudio"));
    assert(audio !== undefined, `esperava POST de audio/PTT, veio ${JSON.stringify(provider.posts.map((p) => p.url))}`);
  } finally {
    provider.restore();
    if (flavorAnterior === undefined) Deno.env.delete("EVOLUTION_API_FLAVOR");
    else Deno.env.set("EVOLUTION_API_FLAVOR", flavorAnterior);
  }
});
