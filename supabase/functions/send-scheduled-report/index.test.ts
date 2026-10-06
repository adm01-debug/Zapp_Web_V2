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
  // Payloads passados a .update() — prova se o agendamento foi (ou não) avançado.
  const updateCalls: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qb: any = {
    select: () => qb,
    gte: () => qb,
    eq: () => qb,
    order: () => qb,
    single: () => Promise.resolve({ data: opts.report ?? null, error: opts.reportError ?? null }),
    update: (payload: unknown) => {
      updateCalls.push(payload);
      return qb;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    from: (table: string) => {
      fromCalls.push(table);
      return qb;
    },
  };
  return { supabase, fromCalls, updateCalls };
}

// fetch do provedor de e-mail: devolve a resposta por destinatário (por `to`).
function resendFetchStub(byRecipient: Record<string, number>, fallback = 200) {
  const calls: Array<{ to: string }> = [];
  const fetchImpl = (_input: RequestInfo | URL, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body ?? "{}")) as { to?: string };
    const to = parsed.to ?? "";
    calls.push({ to });
    const status = byRecipient[to] ?? fallback;
    return Promise.resolve(new Response(status === 200 ? "{}" : "erro", { status }));
  };
  return { fetchImpl, calls };
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

// ─────────────────────────────────────────────────────────────────────────────
// R2-API-023 (P2) — o agendamento só avança (e só se anuncia sucesso) quando o
// envio realmente aconteceu. Antes: o laço só registrava a falha e, em seguida,
// gravava `last_sent_at` e devolvia `success: true` de qualquer jeito.
// ─────────────────────────────────────────────────────────────────────────────

function reportFixture(over: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    report_type: "dashboard_summary",
    recipients: [] as string[],
    frequency: "daily",
    ...over,
  };
}

function cronRequest() {
  return makePost({ headers: { "x-cron-secret": "segredo" }, body: { reportId: crypto.randomUUID() } });
}

Deno.test("envio: falha do provedor (500) → 502, last_sent_at NÃO avança e sem success", async () => {
  const mock = serviceMock({ report: reportFixture({ recipients: ["a@example.com"] }) });
  const fetchStub = resendFetchStub({}, 500);
  const res = await handleScheduledReport(cronRequest(), {
    supabase: mock.supabase,
    cronSecret: "segredo",
    resendApiKey: "chave-de-teste",
    fetchImpl: fetchStub.fetchImpl,
  });
  assert(res.status === 502, `esperado 502, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === false, `success deve ser false: ${JSON.stringify(body)}`);
  assert(
    Array.isArray(body.failedRecipients) && body.failedRecipients.includes("a@example.com"),
    `failedRecipients inesperado: ${JSON.stringify(body.failedRecipients)}`,
  );
  assert(!("reportData" in body), "resposta de falha não pode entregar reportData");
  assert(mock.updateCalls.length === 0, `last_sent_at não pode ser avançado: ${JSON.stringify(mock.updateCalls)}`);
});

Deno.test("envio: sucesso do provedor → 200 e avança last_sent_at/next_send_at", async () => {
  const mock = serviceMock({ report: reportFixture({ recipients: ["a@example.com"], frequency: "daily" }) });
  const fetchStub = resendFetchStub({}, 200);
  const res = await handleScheduledReport(cronRequest(), {
    supabase: mock.supabase,
    cronSecret: "segredo",
    resendApiKey: "chave-de-teste",
    fetchImpl: fetchStub.fetchImpl,
  });
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `success esperado true: ${JSON.stringify(body)}`);
  assert(fetchStub.calls.length === 1, `esperado 1 envio, recebido ${fetchStub.calls.length}`);
  assert(mock.updateCalls.length === 1, `esperado 1 update do agendamento, recebido ${mock.updateCalls.length}`);
  const patch = mock.updateCalls[0] as Record<string, unknown>;
  assert(
    typeof patch.last_sent_at === "string" && typeof patch.next_send_at === "string",
    `update deve avançar last_sent_at e next_send_at: ${JSON.stringify(patch)}`,
  );
});

Deno.test("envio parcial: um de dois destinatários falha → 502, só o falho listado, nada avança", async () => {
  const mock = serviceMock({
    report: reportFixture({ recipients: ["ok@example.com", "falha@example.com"] }),
  });
  const fetchStub = resendFetchStub({ "falha@example.com": 500 }, 200);
  const res = await handleScheduledReport(cronRequest(), {
    supabase: mock.supabase,
    cronSecret: "segredo",
    resendApiKey: "chave-de-teste",
    fetchImpl: fetchStub.fetchImpl,
  });
  assert(res.status === 502, `esperado 502, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === false, `success deve ser false: ${JSON.stringify(body)}`);
  assert(fetchStub.calls.length === 2, `os dois destinatários devem ser tentados: ${JSON.stringify(fetchStub.calls)}`);
  assert(
    body.failedRecipients.length === 1 && body.failedRecipients[0] === "falha@example.com",
    `failedRecipients deve conter só o falho: ${JSON.stringify(body.failedRecipients)}`,
  );
  assert(mock.updateCalls.length === 0, `last_sent_at não pode ser avançado: ${JSON.stringify(mock.updateCalls)}`);
});

Deno.test("envio: sem provedor configurado e com destinatários → 502 (falha fechada), nada avança", async () => {
  const mock = serviceMock({ report: reportFixture({ recipients: ["a@example.com"] }) });
  const fetchStub = resendFetchStub({}, 200);
  const res = await handleScheduledReport(cronRequest(), {
    supabase: mock.supabase,
    cronSecret: "segredo",
    resendApiKey: "",
    fetchImpl: fetchStub.fetchImpl,
  });
  assert(res.status === 502, `esperado 502 (falha fechada), recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === false, `success deve ser false: ${JSON.stringify(body)}`);
  assert(fetchStub.calls.length === 0, "sem provedor não pode tentar enviar");
  assert(mock.updateCalls.length === 0, `last_sent_at não pode ser avançado: ${JSON.stringify(mock.updateCalls)}`);
});

Deno.test("envio: relatório sem destinatários → 200 e avança o agendamento", async () => {
  const mock = serviceMock({ report: reportFixture({ recipients: [] }) });
  const fetchStub = resendFetchStub({}, 200);
  const res = await handleScheduledReport(cronRequest(), {
    supabase: mock.supabase,
    cronSecret: "segredo",
    resendApiKey: "",
    fetchImpl: fetchStub.fetchImpl,
  });
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.success === true, `success esperado true: ${JSON.stringify(body)}`);
  assert(fetchStub.calls.length === 0, "sem destinatários não há envio");
  assert(mock.updateCalls.length === 1, `esperado 1 update, recebido ${mock.updateCalls.length}`);
});
