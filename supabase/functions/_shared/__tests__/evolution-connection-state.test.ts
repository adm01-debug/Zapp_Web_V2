import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractConnectionState } from "../evolution-send.ts";
import { handleConnectionHealthCheck } from "../../connection-health-check/index.ts";

// ---------------------------------------------------------------------------
// E25 / TRA-003 — GO logada sem socket não é conexão aberta.
//
// A Evolution GO responde /instance/status com `{data:{Connected, LoggedIn}}`.
// No estado "Reconnecting" ela manda {Connected:false, LoggedIn:true}: as
// credenciais estão salvas, mas o socket caiu — dentro do contrato E25 isso é
// 'connecting'. `extractConnectionState` ignorava `Connected` e devolvia 'open'
// para qualquer LoggedIn verdadeiro, e o connection-health-check traduzia esse
// 'open' para health="healthy" + status="connected": disponibilidade falsa
// enquanto o WhatsApp estava fora do ar.
//
// Prova: matriz unitária dos três shapes + o efeito real no health-check
// (grava 'degraded', não sobrescreve status para 'connected' e não alerta).
// ---------------------------------------------------------------------------

Deno.env.set("EVOLUTION_API_URL", "https://evolution.test");
Deno.env.set("EVOLUTION_API_KEY", "test-evolution-key");
Deno.env.set("EVOLUTION_INSTANCE_TOKEN", "test-instance-token");
Deno.env.set("EVOLUTION_INSTANCE_NAME", "CONEXAO");
// Sem EVOLUTION_API_FLAVOR o tradutor assume GO — é o flavor do defeito.
Deno.env.delete("EVOLUTION_API_FLAVOR");

// ------------------------------------------------------------- matriz E25

Deno.test("extractConnectionState: GO logada SEM socket (Connected:false, LoggedIn:true) → connecting", () => {
  assertEquals(
    extractConnectionState({ message: "success", data: { Connected: false, LoggedIn: true, Name: "CONEXAO" } }),
    "connecting",
  );
});

Deno.test("extractConnectionState: GO logada E conectada → open", () => {
  assertEquals(
    extractConnectionState({ message: "success", data: { Connected: true, LoggedIn: true, Name: "CONEXAO" } }),
    "open",
  );
});

Deno.test("extractConnectionState: GO sem sessão (LoggedIn:false, Connected:false) → close", () => {
  assertEquals(
    extractConnectionState({ message: "success", data: { Connected: false, LoggedIn: false, Name: "CONEXAO" } }),
    "close",
  );
});

Deno.test("extractConnectionState: flags em minúsculas seguem o mesmo contrato", () => {
  assertEquals(extractConnectionState({ data: { connected: false, loggedIn: true } }), "connecting");
  assertEquals(extractConnectionState({ data: { connected: true, loggedIn: true } }), "open");
  assertEquals(extractConnectionState({ data: { connected: true, loggedIn: false } }), "close");
});

Deno.test("extractConnectionState: sem flag de socket, LoggedIn decide (comportamento anterior preservado)", () => {
  assertEquals(extractConnectionState({ data: { LoggedIn: true } }), "open");
  assertEquals(extractConnectionState({ data: { LoggedIn: false } }), "close");
});

Deno.test("extractConnectionState: shapes v2 ({instance:{state}} e {state}) intactos", () => {
  assertEquals(extractConnectionState({ instance: { state: "open" } }), "open");
  assertEquals(extractConnectionState({ instance: { state: "close" } }), "close");
  assertEquals(extractConnectionState({ state: "connecting" }), "connecting");
});

Deno.test("extractConnectionState: payload sem flags nem state → unknown", () => {
  assertEquals(extractConnectionState({ message: "success" }), "unknown");
  assertEquals(extractConnectionState(null), "unknown");
});

// ------------------------------------------------- efeito no health-check

interface EdgeCall {
  table: string;
  op: "insert" | "update" | "delete" | "select";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Record<string, any>;
}

// Mock no molde de cron-secret-authz-l5.test.ts: builder "thenable" que registra
// cada insert/update por tabela e resolve o await como o PostgREST faria.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(rows: unknown[], calls: EdgeCall[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = (table: string): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: Record<string, any> = {};
    const chain = () => b;
    b.select = chain; b.eq = chain; b.neq = chain; b.or = chain; b.is = chain;
    b.in = chain; b.not = chain; b.lt = chain; b.order = chain; b.limit = chain;
    b.update = (payload: Record<string, unknown>) => { calls.push({ table, op: "update", payload }); return b; };
    b.insert = (payload: Record<string, unknown>) => { calls.push({ table, op: "insert", payload }); return b; };
    b.delete = () => { calls.push({ table, op: "delete" }); return b; };
    b.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    b.maybeSingle = b.single;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (onF: any, onR: any) => Promise.resolve({ data: rows, error: null }).then(onF, onR);
    return b;
  };
  return {
    rpc: () => Promise.resolve({ data: "TEST_cron_secret_fixture_nao_real_0000000000000000", error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: new Error("no user") }) },
    from: (table: string) => builder(table),
  };
}

function stubGoStatus(body: unknown): { urls: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = original; } };
}

const CRON_SECRET = "TEST_cron_secret_fixture_nao_real_0000000000000000";
const CONNECTION_ROW = [{ id: "c1", instance_id: "CONEXAO", status: "connected", phone_number: null }];

function healthRequest(): Request {
  return new Request("https://edge.test/connection-health-check", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
    body: "{}",
  });
}

Deno.test("connection-health-check: GO em Reconnecting grava 'degraded' e NÃO reafirma 'connected'", async () => {
  const calls: EdgeCall[] = [];
  const stub = stubGoStatus({ message: "success", data: { Connected: false, LoggedIn: true, Name: "CONEXAO" } });
  try {
    const res = await handleConnectionHealthCheck(
      healthRequest(),
      { supabase: makeSupabase(CONNECTION_ROW, calls), serviceKey: "service-key-de-teste" },
    );
    assertEquals(res.status, 200);
    const body = await res.json();

    // A GO respondeu: o health-check consultou /instance/status (rota GO).
    assertEquals(stub.urls.some((u) => u.includes("/instance/status")), true);
    // available=false: 'connecting' → 'degraded', nunca 'healthy'.
    assertEquals(body.connections[0].status, "degraded");
    assertEquals(body.alerts_created, 0);

    const logs = calls.filter((c) => c.table === "connection_health_logs" && c.op === "insert");
    assertEquals(logs.length, 1);
    assertEquals(logs[0].payload?.status, "degraded");

    // Nenhum update pode gravar status 'connected' (nem 'disconnected') a partir
    // de um estado transitório: o status da conexão fica como está.
    const statusWrites = calls.filter(
      (c) => c.table === "whatsapp_connections" && c.op === "update" && "status" in (c.payload ?? {}),
    );
    assertEquals(statusWrites.length, 0);
    assertEquals(calls.some((c) => c.table === "warroom_alerts" && c.op === "insert"), false);
  } finally {
    stub.restore();
  }
});

Deno.test("connection-health-check: GO conectada de fato segue 'healthy' (caminho feliz intacto)", async () => {
  const calls: EdgeCall[] = [];
  const stub = stubGoStatus({ message: "success", data: { Connected: true, LoggedIn: true, Name: "CONEXAO" } });
  try {
    const res = await handleConnectionHealthCheck(
      healthRequest(),
      { supabase: makeSupabase(CONNECTION_ROW, calls), serviceKey: "service-key-de-teste" },
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.connections[0].status, "healthy");
    const logs = calls.filter((c) => c.table === "connection_health_logs" && c.op === "insert");
    assertEquals(logs[0].payload?.status, "healthy");
  } finally {
    stub.restore();
  }
});
