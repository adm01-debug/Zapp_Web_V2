// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFetch = (url: any, opts?: any) => Promise<Response>;

export const TEST_SERVICE_KEY = "eyJtest.servicekey.forauth";
export const CAMPAIGN_ID = "campaign-dispatch-001";
export const CONNECTION_ID = "conn-dispatch-001";

export function makePost(opts: {
  bearer?: string;
  cronSecret?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.bearer !== undefined) headers["Authorization"] = `Bearer ${opts.bearer}`;
  if (opts.cronSecret !== undefined) headers["x-cron-secret"] = opts.cronSecret;
  return new Request("https://edge.test/talkx-send", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function thenableQB(result: { data: unknown; error: unknown }): any {
  const p = Promise.resolve(result);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: any = {
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej),
    catch: (fn: (e: unknown) => unknown) => p.catch(fn),
    single: () => p,
    maybeSingle: () => p,
  };
  for (const m of ["select","eq","neq","in","or","order","range","limit","is","not","update","insert","upsert","delete","gte","gt","lte","lt"]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any)[m] = () => self;
  }
  return self;
}

/**
 * X025 — query builder que REGISTRA os `insert` de `talkx_campaign_events` num
 * array, para provar os eventos que a edge grava (connection_failed,
 * skipped_suppressed). As demais operações resolvem vazio.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeEventRecordingQB(events: Array<Record<string, unknown>>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  const chain = () => b;
  for (const m of ["select","eq","neq","in","or","order","range","limit","is","not","update","upsert","delete","gte","gt","lte","lt"]) {
    b[m] = chain;
  }
  b.insert = (row: Record<string, unknown>) => { events.push(row); return b; };
  b.single = () => Promise.resolve({ data: null, error: null });
  b.maybeSingle = () => Promise.resolve({ data: null, error: null });
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(res, rej);
  b.catch = (rej: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).catch(rej);
  return b;
}

/**
 * X033 — query builder que REGISTRA os `insert` numa lista. Aceita linha única OU
 * lote (array), para provar o log por destinatário que a edge grava ao fim da passada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeInsertRecordingQB(rows: Array<Record<string, unknown>>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: Record<string, any> = {};
  const chain = () => b;
  for (const m of ["select","eq","neq","in","or","order","range","limit","is","not","update","upsert","delete","gte","gt","lte","lt"]) {
    b[m] = chain;
  }
  b.insert = (value: Record<string, unknown> | Array<Record<string, unknown>>) => {
    if (Array.isArray(value)) for (const row of value) rows.push(row);
    else rows.push(value);
    return b;
  };
  b.single = () => Promise.resolve({ data: null, error: null });
  b.maybeSingle = () => Promise.resolve({ data: null, error: null });
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(res, rej);
  b.catch = (rej: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).catch(rej);
  return b;
}

export function makeCampaign(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CAMPAIGN_ID, status: "sending", whatsapp_connection_id: CONNECTION_ID,
    message_template: "Ola {{nome}}, tudo bem?", template_id: null, media_url: null,
    media_type: null, sent_count: 0, failed_count: 0, send_interval_min: 0,
    send_interval_max: 0, typing_delay_min: 0, typing_delay_max: 0,
    send_window_start: null, send_window_end: null, business_hours_only: false,
    speed_profile: null, schedule_timezone: "America/Sao_Paulo", ...overrides,
  };
}

export function makeConnection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: CONNECTION_ID, status: "connected", instance_id: "PRINCIPAL", ...overrides };
}

export function makeRecipient(): Record<string, unknown> {
  return {
    id: "recipient-dispatch-001", campaign_id: CAMPAIGN_ID, contact_id: "contact-dispatch-001",
    status: "pending", attempt_count: 0, retry_after: null, message_snapshot_at: null,
    personalized_message: null, media_url_snapshot: null, media_type_snapshot: null,
    variant_id: null,
    contacts: { name: "João Silva", nickname: "João", phone: "+5511999990001", company: "Empresa Teste" },
  };
}

export function makeDispatchDeps(opts: {
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
        if (name === "get_instance_token") return Promise.resolve({ data: "tok-principal", error: null });
        if (name === "talkx_connection_send_budget") return Promise.resolve({
          data: {
            minute_limit: 6, minute_sent: 0, minute_remaining: 6,
            day_limit: 500, day_sent: 0, day_remaining: 500, next_day_at: null,
          },
          error: null,
        });
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
export function makeTestActionDeps(connection: Record<string, unknown> | null): any {
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

export function setDispatchEnv(): void {
  Deno.env.set("SUPABASE_URL", "https://supabase-test.example");
  Deno.env.set("EVOLUTION_API_URL", "https://evolution-test.example");
  Deno.env.set("EVOLUTION_API_KEY", "test-evolution-api-key");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  Deno.env.set("EVOLUTION_INSTANCE_TOKEN", "test-instance-token");
  Deno.env.set("EVOLUTION_INSTANCE_NAME", "PRINCIPAL");
}

export function setDispatchEnvGo(): void {
  Deno.env.set("SUPABASE_URL", "https://supabase-test.example");
  Deno.env.set("EVOLUTION_API_URL", "https://evolution-test.example");
  Deno.env.set("EVOLUTION_API_KEY", "test-evolution-api-key");
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  Deno.env.set("EVOLUTION_INSTANCE_TOKEN", "test-instance-token");
  Deno.env.set("EVOLUTION_INSTANCE_NAME", "PRINCIPAL");
}

export function mockGlobalFetch(failUrlFragment?: string): () => void {
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

export function mockGlobalFetchGo(failUrlFragment?: string): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orig = (globalThis as any).fetch as AnyFetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = (url: unknown, _opts?: unknown): Promise<Response> => {
    const urlStr = String(url);
    if (failUrlFragment && urlStr.includes(failUrlFragment)) {
      return Promise.resolve(new Response(JSON.stringify({ error: "mock server error" }), { status: 500 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ data: { Info: { ID: "go-msg-001" } } }), { status: 200 }));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return () => { (globalThis as any).fetch = orig; };
}

export function makeDispatchPost(opts: { action?: string; campaignId?: string; extra?: Record<string, unknown> } = {}): Request {
  return makePost({
    bearer: TEST_SERVICE_KEY,
    body: { action: opts.action ?? "start", campaignId: opts.campaignId ?? CAMPAIGN_ID, ...opts.extra },
  });
}

// ---------------------------------------------------------------------------
// X011 — harness da ação continue: relógio falso, N destinatários e mocks.
// ---------------------------------------------------------------------------

export const TEST_CRON_SECRET = "cron-secret-talkx-test-64chars-for-timing-safe-comparison-xxxxxx";

/**
 * Relógio falso controlável. Substitui `Date.now` e faz `sleep(ms)` (que usa
 * `setTimeout`) AVANÇAR o relógio em `ms` quando o timer dispara — sem espera
 * real. Timers cancelados antes de disparar (o timeout de 20s por envio, por
 * exemplo) NÃO avançam nada. Assim o orçamento de tempo do `continue` é
 * exercitado de forma determinística.
 */
export interface FakeClock {
  now(): number;
  advance(ms: number): void;
  restore(): void;
}

export function installFakeClock(initial = Date.now()): FakeClock {
  const realNow = Date.now;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realSetTimeout = (globalThis as any).setTimeout as (fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => unknown;
  let now = initial;
  Date.now = () => now;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).setTimeout = (fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    return realSetTimeout(() => {
      if (typeof ms === "number" && ms > 0) now += ms;
      fn(...args);
    }, 0);
  };
  return {
    now: () => now,
    advance: (ms: number) => { now += ms; },
    restore: () => {
      Date.now = realNow;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).setTimeout = realSetTimeout;
    },
  };
}

/** Linha devolvida por `talkx_next_recipients` (formato da RPC da X010). */
export interface ContinueRecipientRow {
  recipient_id: string;
  contact_id: string;
  status: string;
  attempt_count: number;
  retry_after: string | null;
  personalized_message: string | null;
  contact_name: string;
  contact_nickname: string;
  contact_phone: string;
  contact_company: string;
}

/** N destinatários elegíveis, com telefone único (o provedor falso os registra). */
export function makeContinueRecipients(count: number, opts: { retryAfter?: (index: number) => string | null } = {}): ContinueRecipientRow[] {
  return Array.from({ length: count }, (_, i) => ({
    recipient_id: `recipient-${String(i).padStart(3, "0")}`,
    contact_id: `contact-${String(i).padStart(3, "0")}`,
    status: "pending",
    attempt_count: 0,
    retry_after: opts.retryAfter ? opts.retryAfter(i) : null,
    personalized_message: null,
    contact_name: `Contato ${i}`,
    contact_nickname: `C${i}`,
    contact_phone: `55119${String(i).padStart(7, "0")}`,
    contact_company: `Empresa ${i}`,
  }));
}

export interface ContinueMockCtx {
  /** phones enviados ao provedor (na ordem), só de POSTs de mensagem */
  providerPosts: string[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  completions: Array<Record<string, unknown>>;
  /** X025: linhas inseridas em `talkx_campaign_events` (ex.: skipped_suppressed). */
  events: Array<Record<string, unknown>>;
  /** X033: linhas inseridas em `talkx_delivery_log` (log por destinatário). */
  deliveryLogs: Array<Record<string, unknown>>;
  claimWorkerCalls: number;
  releaseWorkerCalls: number;
  completeDrainedCalls: number;
  /** fila viva; enviados/concluídos saem dela (espelha o banco) */
  queue: ContinueRecipientRow[];
}

/** Provedor falso que grava cada phone e devolve um WAMID único por chamada. */
export function mockProviderRecording(): { posts: Array<{ url: string; body: Record<string, unknown> }>; restore: () => void } {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orig = (globalThis as any).fetch as AnyFetch;
  let counter = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = (input: unknown, init?: any): Promise<Response> => {
    const url = typeof input === "string" ? input : String((input as { url?: unknown })?.url ?? input);
    let body: Record<string, unknown> = {};
    try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch { body = {}; }
    posts.push({ url, body });
    counter++;
    return Promise.resolve(new Response(JSON.stringify({ key: { id: `provider-msg-${counter}` } }), { status: 200 }));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { posts, restore: () => { (globalThis as any).fetch = orig; } };
}

/**
 * Deps do handler para `action=continue`: lease de campanha, fila por RPC
 * (`talkx_next_recipients` respeitando `retry_after` contra o relógio), envio,
 * conclusão e o segredo de cron. O `ctx` é reusado entre invocações para
 * simular o tick do cron.
 */
export function makeContinueDeps(opts: {
  recipients: ContinueRecipientRow[];
  clock: { now(): number };
  campaign?: Record<string, unknown>;
  connection?: Record<string, unknown> | null;
  cronSecret?: string | null;
  claimWorker?: (call: number) => boolean;
  suppressAll?: boolean;
  drainedResult?: boolean;
  instanceToken?: string;
  budget?: (sentCount: number) => Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): { deps: any; ctx: ContinueMockCtx } {
  const campaign = opts.campaign ?? makeCampaign({ send_interval_min: 1000, send_interval_max: 1000, typing_delay_min: 0, typing_delay_max: 0 });
  const connection = opts.connection === undefined ? makeConnection() : opts.connection;
  const ctx: ContinueMockCtx = {
    providerPosts: [],
    rpcCalls: [],
    completions: [],
    events: [],
    deliveryLogs: [],
    claimWorkerCalls: 0,
    releaseWorkerCalls: 0,
    completeDrainedCalls: 0,
    queue: [...opts.recipients],
  };
  return {
    ctx,
    deps: {
      serviceKey: TEST_SERVICE_KEY,
      supabase: {
        auth: { getUser: () => Promise.resolve({ data: { user: null }, error: new Error("") }) },
        rpc(name: string, args: Record<string, unknown> = {}) {
          ctx.rpcCalls.push({ name, args });
          switch (name) {
            case "get_talkx_cron_secret":
              return Promise.resolve({ data: opts.cronSecret ?? null, error: null });
            case "claim_talkx_campaign_worker": {
              ctx.claimWorkerCalls++;
              const allowed = opts.claimWorker ? opts.claimWorker(ctx.claimWorkerCalls) : true;
              return Promise.resolve({ data: allowed, error: null });
            }
            case "release_talkx_campaign_worker":
              ctx.releaseWorkerCalls++;
              return Promise.resolve({ data: true, error: null });
            case "talkx_next_recipients": {
              const nowIso = new Date(opts.clock.now()).toISOString();
              const limit = Number(args.p_limit ?? 20);
              const due = ctx.queue
                .filter((r) => r.retry_after === null || r.retry_after <= nowIso)
                .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 20);
              return Promise.resolve({ data: due.map((r) => ({ ...r })), error: null });
            }
            case "claim_talkx_recipient":
              return Promise.resolve({ data: [{ claim_token: `tok-${String(args.p_recipient_id)}` }], error: null });
            case "talkx_recipient_is_suppressed":
              return Promise.resolve({ data: opts.suppressAll ?? false, error: null });
            case "persist_talkx_recipient_message_snapshot":
              return Promise.resolve({
                data: [{ personalized_message: "Ola Contato, tudo bem?", media_url_snapshot: null, media_type_snapshot: null }],
                error: null,
              });
            case "mark_talkx_recipient_dispatch_started":
              return Promise.resolve({ data: null, error: null });
            case "record_talkx_recipient_sent":
              ctx.queue = ctx.queue.filter((r) => r.recipient_id !== args.p_recipient_id);
              return Promise.resolve({ data: true, error: null });
            case "complete_talkx_recipient":
              ctx.completions.push(args);
              ctx.queue = ctx.queue.filter((r) => r.recipient_id !== args.p_recipient_id);
              return Promise.resolve({ data: true, error: null });
            case "reschedule_talkx_recipient":
              return Promise.resolve({ data: null, error: null });
            case "release_talkx_recipient_claim":
              return Promise.resolve({ data: true, error: null });
            case "transition_talkx_campaign":
              return Promise.resolve({ data: [{ current_status: "sending" }], error: null });
            case "complete_talkx_campaign_if_drained":
              ctx.completeDrainedCalls++;
              return Promise.resolve({ data: opts.drainedResult ?? true, error: null });
            case "get_instance_token":
              return Promise.resolve({ data: opts.instanceToken ?? "tok-principal", error: null });
            case "talkx_connection_send_budget": {
              const sentCount = opts.recipients.length - ctx.queue.length;
              return Promise.resolve({
                data: opts.budget
                  ? opts.budget(sentCount)
                  : {
                      minute_limit: 6, minute_sent: 0, minute_remaining: 6,
                      day_limit: 500, day_sent: 0, day_remaining: 500, next_day_at: null,
                    },
                error: null,
              });
            }
            default:
              return Promise.resolve({ data: null, error: null });
          }
        },
        from(table: string) {
          if (table === "talkx_campaigns") return thenableQB({ data: campaign, error: null });
          if (table === "whatsapp_connections") return thenableQB({ data: connection, error: null });
          if (table === "talkx_settings") return thenableQB({ data: [], error: null });
          if (table === "talkx_links") return thenableQB({ data: null, error: null });
          if (table === "contact_custom_fields") return thenableQB({ data: [], error: null });
          if (table === "talkx_campaign_events") return makeEventRecordingQB(ctx.events);
          if (table === "talkx_delivery_log") return makeInsertRecordingQB(ctx.deliveryLogs);
          return thenableQB({ data: null, error: null });
        },
      },
    },
  };
}
