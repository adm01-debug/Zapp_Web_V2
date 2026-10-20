import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleWebhookDiagnostic } from "./index.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos
   clients Supabase (SupabaseClient é genérico e não é importável no teste). */

// R2-API-037 (P2): o diagnostico por conexao contava as MESMAS linhas de
// `messages` para toda instancia — a consulta filtrava so created_at. O trafego
// de A virava, portanto, saude de B, e o handler ainda dependia do teto de
// linhas que o PostgREST devolve. Estes testes chamam o handler REAL com dois
// clientes injetados (caller = auth, service = banco) e o fetch da Evolution
// como stub local. Casos: (1) trafego so em A nao aumenta contagem/saude de B;
// (2) instanceName sem linha no banco fica indeterminado e NAO consulta global;
// (3) falha de contagem no banco nao vira "sem trafego".

interface Counts {
  [connectionId: string]: { contact: number; agent: number };
}

interface QueryState {
  filters: Record<string, unknown>;
  countMode: boolean;
}

function makeCallerClient(isAdmin: boolean): any {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "admin-1" } }, error: null }) },
    rpc: (fn: string) => fn === "is_admin_or_supervisor"
      ? Promise.resolve({ data: isAdmin, error: null })
      : Promise.resolve({ data: null, error: null }),
  };
}

function makeServiceClient(opts: {
  connections: Array<Record<string, unknown>>;
  counts: Counts;
  globalRows: Array<Record<string, unknown>>;
  countError?: { message: string } | null;
  onMessagesQuery?: (state: QueryState) => void;
}): any {
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
          then: (res: any, rej: any) => Promise.resolve({ data: opts.connections, error: null }).then(res, rej),
        };
        return conn;
      }

      // messages
      const state: QueryState & { head: boolean } = { filters: {}, countMode: false, head: false };
      const b: any = {
        select: (_cols: string, options?: { count?: string; head?: boolean }) => {
          state.countMode = options?.count === "exact";
          state.head = options?.head === true;
          return b;
        },
        eq: (col: string, val: unknown) => { state.filters[col] = val; return b; },
        neq: () => b,
        gte: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (res: any, rej: any) => {
          opts.onMessagesQuery?.({ filters: state.filters, countMode: state.countMode });

          // Forma ANTIGA (o defeito): select de linhas, sem escopo por conexao.
          if (!state.countMode) {
            return Promise.resolve({ data: opts.globalRows, error: null }).then(res, rej);
          }

          // Forma NOVA: contagem 'exact' + head, escopada quando ha conexao.
          if (opts.countError) {
            return Promise.resolve({ count: null, data: null, error: opts.countError }).then(res, rej);
          }
          const connId = state.filters["whatsapp_connection_id"] as string | undefined;
          const sender = state.filters["sender"] as string | undefined;
          const sum = (pick: (c: { contact: number; agent: number }) => number) =>
            Object.values(opts.counts).reduce((acc, c) => acc + pick(c), 0);
          let count: number;
          if (connId) {
            const c = opts.counts[connId] ?? { contact: 0, agent: 0 };
            count = sender === "contact" ? c.contact : sender === "agent" ? c.agent : c.contact + c.agent;
          } else if (sender === "contact") {
            count = sum((c) => c.contact);
          } else if (sender === "agent") {
            count = sum((c) => c.agent);
          } else {
            count = sum((c) => c.contact + c.agent);
          }
          return Promise.resolve({ count, data: null, error: null }).then(res, rej);
        },
      };
      return b;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

function stubEvolution(records: Array<{ name: string; webhook: string; events: string }>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: any) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let body: unknown;
    if (url.includes("/instance/all")) body = { data: records };
    else if (url.includes("/instance/status")) body = { data: { LoggedIn: true, Connected: true } };
    else return Promise.resolve(new Response(JSON.stringify({ error: `not stubbed: ${url}` }), { status: 404 }));
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

Deno.env.set("EVOLUTION_API_URL", "https://evolution.test");
Deno.env.set("EVOLUTION_API_KEY", "test-evolution-key");
Deno.env.set("SUPABASE_URL", "https://supabase.test");

const EXPECTED_WEBHOOK = "https://supabase.test/functions/v1/evolution-webhook";
const CONNECTIONS = [
  { id: "conn-a", instance_id: "A", status: "connected" },
  { id: "conn-b", instance_id: "B", status: "connected" },
];
const WEBHOOK_RECORDS = [
  { name: "A", webhook: EXPECTED_WEBHOOK, events: "ALL" },
  { name: "B", webhook: EXPECTED_WEBHOOK, events: "ALL" },
];

function diagnosticRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/functions/v1/webhook-diagnostic", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer admin-jwt" },
    body: JSON.stringify(body),
  });
}

Deno.test("R2-API-037: trafego so em A nao aumenta a contagem nem a saude de B", async () => {
  const restoreFetch = stubEvolution(WEBHOOK_RECORDS);
  const messagesQueries: QueryState[] = [];
  try {
    const res = await handleWebhookDiagnostic(diagnosticRequest({ action: "full-diagnostic" }), {
      callerClient: makeCallerClient(true),
      supabase: makeServiceClient({
        connections: CONNECTIONS,
        // So A recebeu mensagem inbound na ultima hora; B nao tem trafego.
        counts: { "conn-a": { contact: 1, agent: 0 }, "conn-b": { contact: 0, agent: 0 } },
        globalRows: [{ sender: "contact" }],
        onMessagesQuery: (state) => messagesQueries.push(state),
      }),
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    const diagA = body.diagnostics.find((d: any) => d.instance === "A");
    const diagB = body.diagnostics.find((d: any) => d.instance === "B");

    assertEquals(diagA.messageFlow.lastHour.incoming, 1, "A recebeu 1 inbound");
    assertEquals(diagA.messageFlow.flowHealth, "healthy");
    assertEquals(diagB.messageFlow.lastHour.incoming, 0, "B nao pode herdar o inbound de A");
    assertEquals(diagB.messageFlow.flowHealth, "no-traffic");

    // Toda contagem de fluxo tem de estar escopada por conexao (sem consulta global).
    assertEquals(messagesQueries.length > 0, true, "o fluxo deve consultar messages");
    assertEquals(
      messagesQueries.every((q) => Boolean(q.filters["whatsapp_connection_id"])),
      true,
      "nenhuma contagem de fluxo pode rodar sem whatsapp_connection_id",
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("R2-API-037: conexao desconhecida fica indeterminada e nao consulta metrica global", async () => {
  const restoreFetch = stubEvolution(WEBHOOK_RECORDS);
  const messagesQueries: QueryState[] = [];
  try {
    const res = await handleWebhookDiagnostic(
      diagnosticRequest({ action: "full-diagnostic", instanceName: "ghost" }),
      {
        callerClient: makeCallerClient(true),
        supabase: makeServiceClient({
          connections: CONNECTIONS,
          counts: { "conn-a": { contact: 1, agent: 0 }, "conn-b": { contact: 0, agent: 0 } },
          globalRows: [{ sender: "contact" }],
          onMessagesQuery: (state) => messagesQueries.push(state),
        }),
      },
    );

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.diagnostics.length, 1);
    const diag = body.diagnostics[0];
    assertEquals(diag.instance, "ghost");
    assertEquals(diag.connectionResolved, false);
    assertEquals(diag.messageFlow.flowHealth, "unknown");
    assertEquals(diag.messageFlow.scope, "unresolved-connection");
    assertEquals(diag.messageFlow.lastHour.incoming, 0, "nao pode herdar o inbound de A");
    assertEquals(messagesQueries.length, 0, "conexao desconhecida nao consulta metrica global");
  } finally {
    restoreFetch();
  }
});

Deno.test("R2-API-037: falha de contagem no banco nao vira 'sem trafego'", async () => {
  const restoreFetch = stubEvolution(WEBHOOK_RECORDS);
  try {
    const res = await handleWebhookDiagnostic(diagnosticRequest({ action: "full-diagnostic" }), {
      callerClient: makeCallerClient(true),
      supabase: makeServiceClient({
        connections: [CONNECTIONS[0]],
        counts: { "conn-a": { contact: 0, agent: 0 } },
        globalRows: [],
        countError: { message: "contagem indisponivel" },
      }),
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    const diag = body.diagnostics.find((d: any) => d.instance === "A");
    assertEquals(diag.messageFlow.flowHealth, "unknown");
    assertEquals(diag.messageFlow.scope, "query-failed");
  } finally {
    restoreFetch();
  }
});
