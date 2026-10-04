// R2-API-022 (P1) — gate de autorização do cleanup-rate-limit-logs.
//
// Aceite: 401 sem identidade; 403 para usuário comum; cron inválido/ausente
// rejeitado; admin/supervisor e cron válido admitidos; zero DELETE após
// rejeição; predicados de retenção preservados exatamente (logs > 7 dias,
// bloqueios temporários vencidos, alertas resolvidos > 30 dias).
import { handleCleanupRateLimitLogs } from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function makeReq(opts: { headers?: Record<string, string> } = {}) {
  return new Request("https://edge.invalid/cleanup-rate-limit-logs", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
  });
}

// Cliente de escopo usuário (anon key) usado SÓ no gate manual de autorização.
function authClientMock(opts: {
  user?: { id: string } | null;
  userError?: boolean;
  privileged?: boolean;
  roleError?: boolean;
} = {}) {
  return {
    auth: {
      getUser(_token?: string) {
        if (opts.userError) {
          return Promise.resolve({ data: { user: null }, error: new Error("bad token") });
        }
        return Promise.resolve({
          data: { user: opts.user ?? null },
          error: opts.user ? null : new Error("no user"),
        });
      },
    },
    rpc(name: string, _args?: unknown) {
      if (name === "is_admin_or_supervisor") {
        if (opts.roleError) return Promise.resolve({ data: null, error: new Error("rpc fail") });
        return Promise.resolve({ data: opts.privileged ?? false, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

// Cliente service-role que registra a cadeia de filtros de cada DELETE.
function serviceMock() {
  const calls: Array<{ table: string; ops: Array<{ op: string; args: unknown[] }> }> = [];
  const makeBuilder = (table: string) => {
    const ops: Array<{ op: string; args: unknown[] }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      delete: () => builder,
      lt: (...args: unknown[]) => { ops.push({ op: "lt", args }); return builder; },
      eq: (...args: unknown[]) => { ops.push({ op: "eq", args }); return builder; },
      select: () => {
        calls.push({ table, ops });
        return Promise.resolve({ data: [], error: null });
      },
    };
    return builder;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    from: (table: string) => makeBuilder(table),
  };
  return { supabase, calls };
}

Deno.test("cleanup: sem identidade → 401 e zero DELETE", async () => {
  const mock = serviceMock();
  const res = await handleCleanupRateLimitLogs(makeReq(), { supabase: mock.supabase, cronSecret: "" });
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.calls.length === 0, `nenhum DELETE deveria ocorrer: ${JSON.stringify(mock.calls)}`);
});

Deno.test("cleanup: x-cron-secret errado → 401 e zero DELETE", async () => {
  const mock = serviceMock();
  const res = await handleCleanupRateLimitLogs(
    makeReq({ headers: { "x-cron-secret": "errado" } }),
    { supabase: mock.supabase, cronSecret: "segredo" },
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.calls.length === 0, "nenhum DELETE deveria ocorrer");
});

Deno.test("cleanup: CRON_SECRET vazio → x-cron-secret não autoriza (fail closed)", async () => {
  const mock = serviceMock();
  const res = await handleCleanupRateLimitLogs(
    makeReq({ headers: { "x-cron-secret": "qualquer" } }),
    { supabase: mock.supabase, cronSecret: "" },
  );
  assert(res.status === 401, `esperado 401 (falha fechada), recebido ${res.status}`);
  assert(mock.calls.length === 0, "nenhum DELETE deveria ocorrer");
});

Deno.test("cleanup: Bearer inválido → 401 e zero DELETE", async () => {
  const mock = serviceMock();
  const res = await handleCleanupRateLimitLogs(
    makeReq({ headers: { Authorization: "Bearer token-invalido" } }),
    { supabase: mock.supabase, authClient: authClientMock({ userError: true }) },
  );
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.calls.length === 0, "nenhum DELETE deveria ocorrer");
});

Deno.test("cleanup: usuário comum → 403 e zero DELETE", async () => {
  const mock = serviceMock();
  const res = await handleCleanupRateLimitLogs(
    makeReq({ headers: { Authorization: "Bearer jwt-comum" } }),
    { supabase: mock.supabase, authClient: authClientMock({ user: { id: "user-001" }, privileged: false }) },
  );
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  assert(mock.calls.length === 0, "nenhum DELETE deveria ocorrer");
});

Deno.test("cleanup: erro na RPC de papel → 403 e zero DELETE", async () => {
  const mock = serviceMock();
  const res = await handleCleanupRateLimitLogs(
    makeReq({ headers: { Authorization: "Bearer jwt-admin" } }),
    { supabase: mock.supabase, authClient: authClientMock({ user: { id: "user-admin" }, roleError: true }) },
  );
  assert(res.status === 403, `esperado 403 (fail closed na RPC), recebido ${res.status}`);
  assert(mock.calls.length === 0, "nenhum DELETE deveria ocorrer");
});

Deno.test("cleanup: cron válido → executa os três DELETEs com predicados preservados", async () => {
  const mock = serviceMock();
  const before = Date.now();
  const res = await handleCleanupRateLimitLogs(
    makeReq({ headers: { "x-cron-secret": "segredo" } }),
    { supabase: mock.supabase, cronSecret: "segredo" },
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(mock.calls.length === 3, `esperado 3 DELETEs, recebido ${mock.calls.length}: ${JSON.stringify(mock.calls)}`);

  const [logs, blocked, alerts] = mock.calls;

  assert(logs.table === "rate_limit_logs", `tabela inesperada: ${logs.table}`);
  assert(logs.ops.length === 1 && logs.ops[0].op === "lt" && logs.ops[0].args[0] === "created_at",
    `predicado logs inesperado: ${JSON.stringify(logs.ops)}`);
  const logsCutoff = Date.parse(logs.ops[0].args[1] as string);
  assert(Math.abs(logsCutoff - (before - 7 * 24 * 60 * 60 * 1000)) < 2000, "corte dos logs deve ser ~7 dias");

  assert(blocked.table === "blocked_ips", `tabela inesperada: ${blocked.table}`);
  assert(blocked.ops.length === 2, `predicado blocked inesperado: ${JSON.stringify(blocked.ops)}`);
  assert(blocked.ops[0].op === "eq" && blocked.ops[0].args[0] === "is_permanent" && blocked.ops[0].args[1] === false,
    `predicado blocked eq inesperado: ${JSON.stringify(blocked.ops[0])}`);
  assert(blocked.ops[1].op === "lt" && blocked.ops[1].args[0] === "expires_at",
    `predicado blocked lt inesperado: ${JSON.stringify(blocked.ops[1])}`);

  assert(alerts.table === "security_alerts", `tabela inesperada: ${alerts.table}`);
  assert(alerts.ops.length === 2, `predicado alerts inesperado: ${JSON.stringify(alerts.ops)}`);
  assert(alerts.ops[0].op === "eq" && alerts.ops[0].args[0] === "is_resolved" && alerts.ops[0].args[1] === true,
    `predicado alerts eq inesperado: ${JSON.stringify(alerts.ops[0])}`);
  assert(alerts.ops[1].op === "lt" && alerts.ops[1].args[0] === "created_at",
    `predicado alerts lt inesperado: ${JSON.stringify(alerts.ops[1])}`);
  const alertsCutoff = Date.parse(alerts.ops[1].args[1] as string);
  assert(Math.abs(alertsCutoff - (before - 30 * 24 * 60 * 60 * 1000)) < 2000, "corte dos alerts deve ser ~30 dias");
});

Deno.test("cleanup: admin/supervisor válido → executa os DELETEs", async () => {
  const mock = serviceMock();
  const res = await handleCleanupRateLimitLogs(
    makeReq({ headers: { Authorization: "Bearer jwt-admin" } }),
    { supabase: mock.supabase, authClient: authClientMock({ user: { id: "user-admin" }, privileged: true }) },
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(mock.calls.length === 3, `esperado 3 DELETEs, recebido ${mock.calls.length}`);
  const body = await res.json();
  assert(body.success === true, `success esperado true: ${JSON.stringify(body)}`);
});
