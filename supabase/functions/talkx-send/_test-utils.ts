// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFetch = (url: any, opts?: any) => Promise<Response>;

export const TEST_SERVICE_KEY = "eyJtest.servicekey.forauth";
export const CAMPAIGN_ID = "campaign-dispatch-001";
export const CONNECTION_ID = "conn-dispatch-001";

export function makePost(opts: {
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
export function thenableQB(result: { data: unknown; error: unknown }): any {
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
}

export function setDispatchEnvGo(): void {
  Deno.env.set("SUPABASE_URL", "https://supabase-test.example");
  Deno.env.set("EVOLUTION_API_URL", "https://evolution-test.example");
  Deno.env.set("EVOLUTION_API_KEY", "test-evolution-api-key");
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  Deno.env.set("EVOLUTION_INSTANCE_TOKEN", "test-instance-token");
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

export function makeDispatchPost(opts: { action?: string; campaignId?: string; extra?: Record<string, unknown> } = {}): Request {
  return makePost({
    bearer: TEST_SERVICE_KEY,
    body: { action: opts.action ?? "start", campaignId: opts.campaignId ?? CAMPAIGN_ID, ...opts.extra },
  });
}
