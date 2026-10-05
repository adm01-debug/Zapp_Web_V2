// R2-API-022 (P1) — gate de autorização do send-rate-limit-alert.
//
// Aceite: segredo INTERNAL_ALERT_SECRET ausente/vazio/incorreto → 401 sem
// nenhuma escrita via service-role (zero from()); segredo correto → 200 e
// o alerta é gravado. A comparação do segredo é em tempo constante e o gate
// roda ANTES de criar o cliente service-role ou de confiar em ip/count/blocked.
import { handleRateLimitAlert } from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function makePost(opts: { headers?: Record<string, string>; body?: unknown } = {}) {
  return new Request("https://edge.invalid/send-rate-limit-alert", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
    body: JSON.stringify(opts.body ?? {
      ip_address: "203.0.113.7",
      endpoint: "/api/teste",
      request_count: 42,
      blocked: false,
    }),
  });
}

// Cliente service-role (usado SÓ depois da autorização) com contagem de tabelas.
function serviceMock(opts: { admins?: unknown[] } = {}) {
  const fromCalls: string[] = [];
  const makeBuilder = (_table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      select: () => builder,
      eq: () => builder,
      // thenable: await .from("user_roles").select("user_id").eq("role","admin")
      then: (resolve: (v: unknown) => void) => resolve({ data: opts.admins ?? [], error: null }),
    };
    return builder;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    from: (table: string) => {
      fromCalls.push(table);
      return makeBuilder(table);
    },
  };
  return { supabase, fromCalls };
}

Deno.test("alerta: segredo ausente → 401 e zero escrita service-role", async () => {
  const mock = serviceMock();
  const res = await handleRateLimitAlert(makePost(), { supabase: mock.supabase, internalSecret: "" });
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
});

Deno.test("alerta: segredo vazio com header presente → 401 (falha fechada)", async () => {
  const mock = serviceMock();
  const res = await handleRateLimitAlert(
    makePost({ headers: { "X-Internal-Secret": "qualquer" } }),
    { supabase: mock.supabase, internalSecret: "" },
  );
  assert(res.status === 401, `esperado 401 (falha fechada), recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
});

Deno.test("alerta: segredo incorreto → 401 e zero escrita", async () => {
  const mock = serviceMock();
  const res = await handleRateLimitAlert(
    makePost({ headers: { "X-Internal-Secret": "errado" } }),
    { supabase: mock.supabase, internalSecret: "segredo" },
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
});

Deno.test("alerta: segredo correto → 200 e grava security_alerts", async () => {
  const mock = serviceMock();
  const res = await handleRateLimitAlert(
    makePost({ headers: { "X-Internal-Secret": "segredo" } }),
    { supabase: mock.supabase, internalSecret: "segredo" },
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(mock.fromCalls.includes("security_alerts"), `security_alerts deveria ser gravado: ${JSON.stringify(mock.fromCalls)}`);
  const body = await res.json();
  assert(body.success === true, `success esperado true: ${JSON.stringify(body)}`);
});

Deno.test("alerta: segredo correto + blocked → grava security_alerts, blocked_ips e notifications", async () => {
  const mock = serviceMock({ admins: [{ user_id: crypto.randomUUID() }] });
  const res = await handleRateLimitAlert(
    makePost({
      headers: { "X-Internal-Secret": "segredo" },
      body: { ip_address: "203.0.113.7", endpoint: "/api/teste", request_count: 99, blocked: true },
    }),
    { supabase: mock.supabase, internalSecret: "segredo" },
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(mock.fromCalls.includes("security_alerts"), "security_alerts deveria ser gravado");
  assert(mock.fromCalls.includes("blocked_ips"), "blocked_ips deveria ser gravado (blocked=true)");
  assert(mock.fromCalls.includes("notifications"), "notifications deveria ser gravado (admin presente)");
});
