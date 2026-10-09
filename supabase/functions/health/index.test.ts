// Item 035 (plano de paridade V1/V3) — edge `health`.
//
// Prova o aceite do item: acesso fechado por padrão (401 sem identidade, 403 sem
// papel) e 503 quando o banco está indisponível — o corpo diz qual checagem caiu.
import { handleHealth } from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** Cliente service-role falso: só o HEAD/`select` de conectividade é usado. */
function supabaseMock(opts: { error?: Error | null } = {}) {
  const calls: string[] = [];
  const supabase = {
    from(table: string) {
      calls.push(table);
      return {
        select: () => Promise.resolve({ error: opts.error ?? null }),
      };
    },
  };
  return { supabase, calls };
}

const req = (headers: Record<string, string> = {}) =>
  new Request("https://edge.invalid/health", { headers });

Deno.test("health: sem identidade → 401 e NENHUMA consulta ao banco", async () => {
  const mock = supabaseMock();
  const res = await handleHealth(req(), { supabase: mock.supabase, auth: { cronSecret: "segredo" } });
  assert(res.status === 401, `esperado 401, veio ${res.status}`);
  assert(mock.calls.length === 0, `não deveria consultar o banco: ${JSON.stringify(mock.calls)}`);
});

Deno.test("health: segredo de cron errado → 401", async () => {
  const mock = supabaseMock();
  const res = await handleHealth(req({ "x-cron-secret": "errado" }), {
    supabase: mock.supabase, auth: { cronSecret: "segredo" },
  });
  assert(res.status === 401, `esperado 401, veio ${res.status}`);
  assert(mock.calls.length === 0, "não deveria consultar o banco");
});

Deno.test("health: banco de pé + cron válido → 200 healthy", async () => {
  const mock = supabaseMock({ error: null });
  const res = await handleHealth(req({ "x-cron-secret": "segredo" }), {
    supabase: mock.supabase, auth: { cronSecret: "segredo" },
  });
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  const body = await res.json();
  assert(body.status === "healthy", `status inesperado: ${JSON.stringify(body)}`);
  assert(body.checks.database.status === "up", `checagem de banco inesperada: ${JSON.stringify(body)}`);
  assert(typeof body.checks.database.latency_ms === "number", "latência ausente");
});

Deno.test("health: banco indisponível → 503 unhealthy (não 200 vazio)", async () => {
  const mock = supabaseMock({ error: new Error("connection refused") });
  const res = await handleHealth(req({ "x-cron-secret": "segredo" }), {
    supabase: mock.supabase, auth: { cronSecret: "segredo" },
  });
  assert(res.status === 503, `esperado 503, veio ${res.status}`);
  const body = await res.json();
  assert(body.status === "unhealthy", `status inesperado: ${JSON.stringify(body)}`);
  assert(body.checks.database.status === "down", "checagem de banco deveria estar down");
  assert(!JSON.stringify(body).includes("connection refused"), "503 não pode vazar o erro do driver");
});

Deno.test("health: admin autenticado → 200 (mesma porta do cron)", async () => {
  const mock = supabaseMock({ error: null });
  const authClient = {
    auth: { getUser: (_t: string) => Promise.resolve({ data: { user: { id: "u1" } }, error: null }) },
    rpc: (_n: string, _a: Record<string, unknown>) => Promise.resolve({ data: true, error: null }),
  };
  const res = await handleHealth(req({ Authorization: "Bearer jwt-admin" }), {
    supabase: mock.supabase, auth: { authClient },
  });
  assert(res.status === 200, `esperado 200, veio ${res.status}`);
});
