import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleWebhookDiagnostic } from "./index.ts";
import { resetInstanceTokenCache } from "../_shared/evolution-instance-token.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos
   clients Supabase (SupabaseClient é genérico e não é importável no teste). */

// T-25a0a972: o "Testar E2E" do painel vira AÇÃO NO SERVIDOR. Antes o navegador
// invocava `evolution-webhook` com um `messages.upsert` de EXEMPLO: sem HMAC nem
// instanceToken levava 401 e, se passasse, criava contato/mensagem reais. A ação
// `selftest` faz o round-trip aqui no servidor com o evento RESERVADO `selftest`
// (o webhook responde 200 sem handler, sem escrita) e ainda entrega a lista de
// eventos esperada por flavor, que antes o painel comparava com nomes errados.

const WEBHOOK_PATH = "/functions/v1/evolution-webhook";

function makeCallerClient(isAdmin: boolean): any {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "admin-1" } }, error: null }) },
    rpc: (fn: string) => fn === "is_admin_or_supervisor"
      ? Promise.resolve({ data: isAdmin, error: null })
      : Promise.resolve({ data: null, error: null }),
  };
}

interface MessageQuery {
  filters: Record<string, unknown>;
  countMode: boolean;
}

function makeServiceClient(opts: {
  token?: string | null;
  connections?: Array<Record<string, unknown>>;
  counts?: Record<string, { contact: number; agent: number }>;
  onMessagesQuery?: (q: MessageQuery) => void;
}): any {
  const connections = opts.connections ?? [];
  const counts = opts.counts ?? {};
  return {
    from(table: string) {
      if (table === "whatsapp_connections") {
        const conn: any = {
          select: () => conn,
          eq: () => conn,
          neq: () => conn,
          order: () => conn,
          limit: () => conn,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          then: (res: any, rej: any) => Promise.resolve({ data: connections, error: null }).then(res, rej),
        };
        return conn;
      }
      // messages
      const state: MessageQuery = { filters: {}, countMode: false };
      const b: any = {
        select: (_c: string, o?: { count?: string; head?: boolean }) => { state.countMode = o?.count === "exact"; return b; },
        eq: (col: string, val: unknown) => { state.filters[col] = val; return b; },
        neq: () => b,
        gte: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (res: any, rej: any) => {
          opts.onMessagesQuery?.({ filters: state.filters, countMode: state.countMode });
          const connId = state.filters["whatsapp_connection_id"] as string | undefined;
          const sender = state.filters["sender"] as string | undefined;
          const c = countFor(connId ? counts[connId] : undefined, sender);
          return Promise.resolve({ count: c, data: null, error: null }).then(res, rej);
        },
      };
      return b;
    },
    rpc: (fn: string) => fn === "get_instance_token"
      ? Promise.resolve({ data: opts.token ?? null, error: null })
      : Promise.resolve({ data: null, error: null }),
  };
}

function countFor(c: { contact: number; agent: number } | undefined, sender?: string): number {
  if (!c) return 0;
  if (sender === "contact") return c.contact;
  if (sender === "agent") return c.agent;
  return c.contact + c.agent;
}

/** Servidor local que faz o papel do evolution-webhook real e grava o que recebeu. */
function startFakeWebhook() {
  const calls: Array<{ path: string; body: any }> = [];
  let ready!: (v: { url: string }) => void;
  const whenReady = new Promise<{ url: string }>((resolve) => { ready = resolve; });
  const server = Deno.serve(
    { port: 0, onListen: ({ hostname, port }) => ready({ url: `http://${hostname}:${port}` }) },
    async (req) => {
      const body = await req.json().catch(() => null);
      calls.push({ path: new URL(req.url).pathname, body });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  );
  return { calls, whenReady, stop: () => server.shutdown() };
}

function selftestRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/functions/v1/webhook-diagnostic", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer admin-jwt" },
    body: JSON.stringify(body),
  });
}

Deno.env.set("EVOLUTION_API_URL", "https://evolution.test");
Deno.env.set("EVOLUTION_API_KEY", "test-evolution-key");

Deno.test("selftest: round-trip no servidor com o evento reservado e sem dado real", async () => {
  const fake = startFakeWebhook();
  const { url } = await fake.whenReady;
  Deno.env.set("SUPABASE_URL", url);
  resetInstanceTokenCache();
  try {
    const res = await handleWebhookDiagnostic(
      selftestRequest({ action: "selftest", instanceName: "PRINCIPAL" }),
      { callerClient: makeCallerClient(true), supabase: makeServiceClient({ token: "tok-instancia" }) },
    );
    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json.ok, true);
    assertEquals(json.status, 200);
    assertEquals(json.event, "selftest");
    assertEquals(typeof json.latencyMs, "number", "o autoteste mede a latência");

    assertEquals(fake.calls.length, 1, "o servidor faz exatamente uma chamada ao webhook");
    assertEquals(fake.calls[0].path, WEBHOOK_PATH);
    assertEquals(fake.calls[0].body.event, "selftest", "usa o evento RESERVADO, não messages.upsert");
    assertEquals(fake.calls[0].body.instance, "PRINCIPAL");
    assertEquals(fake.calls[0].body.instanceToken, "tok-instancia", "leva a credencial da instância");
    assertEquals(JSON.stringify(fake.calls[0].body).includes("messages.upsert"), false, "não pode simular mensagem");
    assertEquals(fake.calls[0].body.data, {}, "sem conteúdo de mensagem");
  } finally {
    await fake.stop();
  }
});

Deno.test("selftest: sem credencial da instância não chama o webhook (motivo explícito)", async () => {
  const fake = startFakeWebhook();
  const { url } = await fake.whenReady;
  Deno.env.set("SUPABASE_URL", url);
  resetInstanceTokenCache();
  try {
    const res = await handleWebhookDiagnostic(
      selftestRequest({ action: "selftest", instanceName: "SEM-TOKEN" }),
      { callerClient: makeCallerClient(true), supabase: makeServiceClient({ token: null }) },
    );
    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json.ok, false);
    assertEquals(json.reason, "sem-credencial");
    assertEquals(fake.calls.length, 0, "sem token não há o que testar — não dispara 401");
  } finally {
    await fake.stop();
  }
});

Deno.test("selftest: sem instanceName é 400 (nada a testar)", async () => {
  resetInstanceTokenCache();
  const res = await handleWebhookDiagnostic(
    selftestRequest({ action: "selftest" }),
    { callerClient: makeCallerClient(true), supabase: makeServiceClient({ token: "t" }) },
  );
  assertEquals(res.status, 400);
  assertEquals((await res.json()).reason, "sem-instancia");
});

// ─── Eventos esperados por flavor (o painel mostrava "0/20" no GO) ────────────

const EXPECTED_URL = "https://supabase.test/functions/v1/evolution-webhook";
const CONNECTIONS = [{ id: "conn-a", instance_id: "A", status: "connected" }];

function stubWebhookLookup(flavor: "go" | "v2"): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: any) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let body: unknown;
    if (u.includes("/instance/all") || u.includes("/instance/fetchInstances")) {
      body = { data: [{ name: "A", webhook: EXPECTED_URL, events: "Message,ReadReceipt" }] };
    } else if (u.includes("/webhook/find/A")) {
      body = { webhook: { url: EXPECTED_URL, events: ["MESSAGES_UPSERT"] } };
    } else if (u.includes("/instance/connectionState/")) {
      body = { instance: { state: "open" } };
    } else {
      return Promise.resolve(new Response(JSON.stringify({ error: `not stubbed: ${u}` }), { status: 404 }));
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

Deno.env.set("SUPABASE_URL", "https://supabase.test");

Deno.test("flavor GO: eventos esperados são os nomes do GO, com a contagem presente", async () => {
  Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  const restore = stubWebhookLookup("go");
  try {
    const res = await handleWebhookDiagnostic(selftestRequest({ action: "full-diagnostic" }), {
      callerClient: makeCallerClient(true),
      supabase: makeServiceClient({ connections: CONNECTIONS, counts: { "conn-a": { contact: 0, agent: 0 } } }),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    const diag = body.diagnostics.find((d: any) => d.instance === "A");
    assertEquals(diag.webhook.expectedEvents, ["Message", "ReadReceipt", "ConnectionUpdate", "SendMessage"]);
    assertEquals(diag.webhook.expectedCount, 4);
    assertEquals(diag.webhook.presentCount, 2, "Message e ReadReceipt presentes");
  } finally {
    restore();
  }
});

Deno.test("flavor v2: eventos esperados são os nomes do v2 (não os do GO)", async () => {
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  const restore = stubWebhookLookup("v2");
  try {
    const res = await handleWebhookDiagnostic(selftestRequest({ action: "full-diagnostic" }), {
      callerClient: makeCallerClient(true),
      supabase: makeServiceClient({ connections: CONNECTIONS, counts: { "conn-a": { contact: 0, agent: 0 } } }),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    const diag = body.diagnostics.find((d: any) => d.instance === "A");
    assert(diag.webhook.expectedEvents.includes("MESSAGES_UPSERT"), "v2 lista nomes v2");
    assertEquals(diag.webhook.expectedEvents.includes("Message"), false, "v2 não usa o nome do GO");
    assertEquals(diag.webhook.presentCount, 1, "só MESSAGES_UPSERT presente");
  } finally {
    restore();
    Deno.env.set("EVOLUTION_API_FLAVOR", "go");
  }
});
