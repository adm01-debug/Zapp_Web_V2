// R2-API-022 (P1) — gate de autorização do send-scheduled-report.
//
// Aceite: 401 sem identidade; 403 para usuário comum; cron inválido/ausente
// rejeitado; admin/supervisor e cron válido admitidos; zero lookup de
// relatório / Resend / efeito service-role após rejeição; usuário comum não
// recebe reportData.
import { handleScheduledReport } from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function makePost(opts: { headers?: Record<string, string>; body?: unknown } = {}) {
  return new Request("https://edge.invalid/send-scheduled-report", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
    body: JSON.stringify(opts.body ?? { reportId: crypto.randomUUID() }),
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

// Cliente service-role (usado SÓ depois da autorização) com contagem de tabelas.
function serviceMock(opts: { report?: unknown; reportError?: unknown } = {}) {
  const fromCalls: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qb: any = {
    select: () => qb,
    gte: () => qb,
    eq: () => qb,
    order: () => qb,
    single: () => Promise.resolve({ data: opts.report ?? null, error: opts.reportError ?? null }),
    update: () => qb,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    from: (table: string) => {
      fromCalls.push(table);
      return qb;
    },
  };
  return { supabase, fromCalls };
}

Deno.test("auth: sem identidade → 401 e zero lookup/Resend/service-role", async () => {
  const mock = serviceMock();
  const req = makePost();
  const res = await handleScheduledReport(req, { supabase: mock.supabase, cronSecret: "" });
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
  const body = await res.json();
  assert(!("reportData" in body), "401 não pode conter reportData");
});

Deno.test("auth: x-cron-secret errado → 401 sem efeito", async () => {
  const mock = serviceMock();
  const req = makePost({ headers: { "x-cron-secret": "errado" } });
  const res = await handleScheduledReport(req, { supabase: mock.supabase, cronSecret: "segredo" });
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
});

Deno.test("auth: CRON_SECRET vazio → x-cron-secret não autoriza (fail closed)", async () => {
  const mock = serviceMock();
  const req = makePost({ headers: { "x-cron-secret": "qualquer" } });
  const res = await handleScheduledReport(req, { supabase: mock.supabase, cronSecret: "" });
  assert(res.status === 401, `esperado 401 (falha fechada), recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
});

Deno.test("auth: Bearer inválido → 401 sem efeito", async () => {
  const mock = serviceMock();
  const req = makePost({ headers: { Authorization: "Bearer token-invalido" } });
  const res = await handleScheduledReport(req, {
    supabase: mock.supabase,
    authClient: authClientMock({ userError: true }),
  });
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
});

Deno.test("auth: usuário comum (JWT válido, sem admin/supervisor) → 403 sem reportData", async () => {
  const mock = serviceMock();
  const req = makePost({ headers: { Authorization: "Bearer jwt-comum" } });
  const res = await handleScheduledReport(req, {
    supabase: mock.supabase,
    authClient: authClientMock({ user: { id: "user-001" }, privileged: false }),
  });
  assert(res.status === 403, `esperado 403, recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, `from() não deveria ser chamado: ${JSON.stringify(mock.fromCalls)}`);
  const body = await res.json();
  assert(!("reportData" in body), "usuário comum não pode receber reportData");
});

Deno.test("auth: erro na RPC de papel → 403 (não abre por falha)", async () => {
  const mock = serviceMock();
  const req = makePost({ headers: { Authorization: "Bearer jwt-admin" } });
  const res = await handleScheduledReport(req, {
    supabase: mock.supabase,
    authClient: authClientMock({ user: { id: "user-admin" }, roleError: true }),
  });
  assert(res.status === 403, `esperado 403 (fail closed na RPC), recebido ${res.status}`);
  assert(mock.fromCalls.length === 0, "from() não deveria ser chamado após erro de papel");
});

Deno.test("auth: admin admitido → alcança o lookup do relatório", async () => {
  const mock = serviceMock({ reportError: { message: "not found" } });
  const req = makePost({ headers: { Authorization: "Bearer jwt-admin" } });
  const res = await handleScheduledReport(req, {
    supabase: mock.supabase,
    authClient: authClientMock({ user: { id: "user-admin" }, privileged: true }),
  });
  assert(res.status === 404, `esperado 404 (auth ok, relatório ausente), recebido ${res.status}`);
  assert(mock.fromCalls.includes("scheduled_reports"), "admin autorizado deve alcançar o lookup");
});

Deno.test("auth: cron válido → admitido, alcança o lookup do relatório", async () => {
  const mock = serviceMock({ reportError: { message: "not found" } });
  const req = makePost({ headers: { "x-cron-secret": "segredo" } });
  const res = await handleScheduledReport(req, { supabase: mock.supabase, cronSecret: "segredo" });
  assert(res.status === 404, `esperado 404 (auth ok via cron), recebido ${res.status}`);
  assert(mock.fromCalls.includes("scheduled_reports"), "cron válido deve alcançar o lookup");
});

Deno.test("admin autorizado processa o relatório e recebe reportData", async () => {
  const mock = serviceMock({
    report: { id: crypto.randomUUID(), report_type: "dashboard_summary", recipients: [], frequency: "daily" },
  });
  const req = makePost({
    headers: { Authorization: "Bearer jwt-admin" },
    body: { reportId: crypto.randomUUID() },
  });
  const res = await handleScheduledReport(req, {
    supabase: mock.supabase,
    authClient: authClientMock({ user: { id: "user-admin" }, privileged: true }),
  });
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `success esperado true: ${JSON.stringify(body)}`);
  assert(body.reportData && body.reportData.title === "Resumo do Dashboard",
    `reportData inesperado: ${JSON.stringify(body.reportData)}`);
});
