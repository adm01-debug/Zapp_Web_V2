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
// `updates` guarda o que o handler tentou gravar (R2-API-023: sem gravação, sem
// ciclo confirmado), e `updateError` simula indisponibilidade do banco.
function serviceMock(opts: {
  report?: unknown;
  reportError?: unknown;
  updateError?: unknown;
  updateRows?: unknown[];
} = {}) {
  const fromCalls: string[] = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  let currentTable = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qb: any = {
    select: () => qb,
    gte: () => qb,
    eq: () => qb,
    order: () => qb,
    single: () => Promise.resolve({ data: opts.report ?? null, error: opts.reportError ?? null }),
    update: (payload: Record<string, unknown>) => {
      updates.push({ table: currentTable, payload });
      // O PostgREST devolve `data` com as linhas afetadas (array vazio = nada foi
      // gravado, sem erro) e `error` quando a escrita falha.
      const result = {
        data: opts.updateError ? null : (opts.updateRows ?? [{ id: "linha-atualizada" }]),
        error: opts.updateError ?? null,
      };
      // Cadeia do UPDATE: `.eq()` continua encadeável e `.select()` resolve o
      // resultado do PostgREST (que é o que o handler confere).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateChain: any = {
        eq: () => updateChain,
        select: () => Promise.resolve(result),
      };
      return updateChain;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    from: (table: string) => {
      currentTable = table;
      fromCalls.push(table);
      return qb;
    },
  };
  return { supabase, fromCalls, updates };
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
// R2-API-023 (P2) — falha de envio NÃO pode marcar o relatório como enviado.
//
// Antes da correção o handler registrava `last_sent_at`/`next_send_at` e
// devolvia `success: true` mesmo com a chave do provedor ausente, com recusa
// HTTP de um destinatário ou com o UPDATE do agendamento falhando. Aceite:
// nenhuma dessas falhas avança o agendamento nem responde sucesso, e a resposta
// distingue enviado de parcial e de falha.
// ─────────────────────────────────────────────────────────────────────────────

const CRON_HEADERS = { "x-cron-secret": "segredo" };

/** Substitui `globalThis.fetch` pelo provedor de e-mail falso (um status por envio). */
function withResendStub(statuses: number[]) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  const recipients: string[] = [];
  let index = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (!url.includes("api.resend.com/emails")) {
      throw new Error(`fetch inesperado no teste: ${url}`);
    }
    const payload = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (typeof payload.to === "string") recipients.push(payload.to);
    const status = statuses[index] ?? statuses[statuses.length - 1] ?? 200;
    index += 1;
    return Promise.resolve(
      new Response(JSON.stringify(status >= 400 ? { message: "recusado" } : { id: "email-id" }), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return {
    calls,
    recipients,
    restore: () => { globalThis.fetch = original; },
  };
}

/** Define/limpa RESEND_API_KEY durante o teste e restaura o valor anterior. */
async function withResendKey<T>(key: string | null, fn: () => Promise<T>): Promise<T> {
  const previous = Deno.env.get("RESEND_API_KEY");
  if (key === null) Deno.env.delete("RESEND_API_KEY");
  else Deno.env.set("RESEND_API_KEY", key);
  try {
    return await fn();
  } finally {
    if (previous === undefined) Deno.env.delete("RESEND_API_KEY");
    else Deno.env.set("RESEND_API_KEY", previous);
  }
}

function reportWith(recipients: string[]) {
  return {
    id: crypto.randomUUID(),
    report_type: "dashboard_summary",
    recipients,
    frequency: "daily",
  };
}

function cronPost() {
  return makePost({ headers: CRON_HEADERS, body: { reportId: crypto.randomUUID() } });
}

Deno.test("envio: provedor recusa TODOS os destinatários → não marca enviado nem responde sucesso", async () => {
  const mock = serviceMock({ report: reportWith(["a@exemplo.test", "b@exemplo.test"]) });
  const resend = withResendStub([422, 422]);
  try {
    await withResendKey("chave-de-teste", async () => {
      const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
      const body = await res.json();
      assert(res.status !== 200, `resposta 200 após falha total de envio: ${res.status}`);
      assert(body.success !== true, `success não pode ser true: ${JSON.stringify(body)}`);
      assert(body.status === "failed", `status esperado "failed": ${JSON.stringify(body)}`);
      assert(body.last_sent_advanced === false, `last_sent_advanced deve ser false: ${JSON.stringify(body)}`);
      assert(resend.calls.length === 2, `os dois destinatários devem ser tentados: ${resend.calls.length}`);
      assert(mock.updates.length === 0,
        `agendamento não pode avançar após falha total: ${JSON.stringify(mock.updates)}`);
    });
  } finally {
    resend.restore();
  }
});

Deno.test("envio: um destinatário recusado → parcial avança ciclo e registra só o recusado", async () => {
  const mock = serviceMock({ report: reportWith(["aceito@exemplo.test", "recusado@exemplo.test"]) });
  const resend = withResendStub([200, 422]);
  try {
    await withResendKey("chave-de-teste", async () => {
      const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
      const body = await res.json();
      assert(res.status !== 200, `parcial não deve ser 200 cheio: ${res.status}`);
      assert(body.success !== true, `success não pode ser true no parcial: ${JSON.stringify(body)}`);
      assert(body.status === "partial", `status esperado "partial": ${JSON.stringify(body)}`);
      assert(body.delivered === 1 && body.failed === 1 && body.total === 2,
        `contagem inesperada: ${JSON.stringify(body)}`);
      assert(JSON.stringify(resend.recipients) === JSON.stringify(["aceito@exemplo.test", "recusado@exemplo.test"]),
        `cada destinatário original deve ser tentado uma vez: ${JSON.stringify(resend.recipients)}`);
      assert(JSON.stringify(body.failed_recipients) === JSON.stringify(["recusado@exemplo.test"]),
        `a resposta deve registrar só o destinatário recusado: ${JSON.stringify(body)}`);
      assert(!("delivered_recipients" in body), `não deve registrar quem já recebeu para reenvio: ${JSON.stringify(body)}`);
      assert(body.last_sent_advanced === true, `partial deve avançar last_sent_at: ${JSON.stringify(body)}`);
      assert(mock.updates.length === 1,
        `agendamento deve avançar uma vez no parcial: ${JSON.stringify(mock.updates)}`);
      const payload = mock.updates[0].payload;
      assert(typeof payload.last_sent_at === "string" && payload.last_sent_at.length > 0,
        `last_sent_at ausente no parcial: ${JSON.stringify(payload)}`);
      assert(typeof payload.next_send_at === "string" && payload.next_send_at.length > 0,
        `next_send_at ausente no parcial: ${JSON.stringify(payload)}`);
      assert(!("recipients" in payload), `não pode sobrescrever a lista durável de destinatários: ${JSON.stringify(payload)}`);
    });
  } finally {
    resend.restore();
  }
});

Deno.test("envio: RESEND_API_KEY ausente com destinatários → falha de configuração não marca enviado", async () => {
  const mock = serviceMock({ report: reportWith(["a@exemplo.test"]) });
  const resend = withResendStub([200]);
  try {
    await withResendKey(null, async () => {
      const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
      const body = await res.json();
      assert(res.status >= 500, `falha de configuração não pode responder 2xx: ${res.status}`);
      assert(body.success !== true, `success não pode ser true: ${JSON.stringify(body)}`);
      assert(body.status === "failed", `status esperado "failed": ${JSON.stringify(body)}`);
      assert(resend.calls.length === 0, "não pode chamar o provedor sem chave configurada");
      assert(mock.updates.length === 0,
        `agendamento não pode avançar sem provedor configurado: ${JSON.stringify(mock.updates)}`);
    });
  } finally {
    resend.restore();
  }
});

Deno.test("envio: falha do UPDATE do agendamento → não anuncia sucesso", async () => {
  const mock = serviceMock({
    report: reportWith(["a@exemplo.test"]),
    updateError: { message: "banco indisponível" },
  });
  const resend = withResendStub([200]);
  try {
    await withResendKey("chave-de-teste", async () => {
      const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
      const body = await res.json();
      assert(res.status >= 500, `UPDATE falho não pode responder 2xx: ${res.status}`);
      assert(body.success !== true, `success não pode ser true: ${JSON.stringify(body)}`);
      assert(body.last_sent_advanced === false, `last_sent_advanced deve ser false: ${JSON.stringify(body)}`);
      assert(mock.updates.length === 1, `o UPDATE deve ter sido tentado uma vez: ${JSON.stringify(mock.updates)}`);
    });
  } finally {
    resend.restore();
  }
});

Deno.test("envio: UPDATE sem nenhuma linha afetada → não anuncia sucesso", async () => {
  const mock = serviceMock({ report: reportWith(["a@exemplo.test"]), updateRows: [] });
  const resend = withResendStub([200]);
  try {
    await withResendKey("chave-de-teste", async () => {
      const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
      const body = await res.json();
      assert(res.status >= 500, `zero linhas gravadas não pode responder 2xx: ${res.status}`);
      assert(body.success !== true, `success não pode ser true: ${JSON.stringify(body)}`);
      assert(body.last_sent_advanced === false, `last_sent_advanced deve ser false: ${JSON.stringify(body)}`);
    });
  } finally {
    resend.restore();
  }
});

Deno.test("envio: todos aceitos → avança last_sent_at/next_send_at e responde sucesso", async () => {
  const mock = serviceMock({ report: reportWith(["a@exemplo.test", "b@exemplo.test"]) });
  const resend = withResendStub([200, 200]);
  try {
    await withResendKey("chave-de-teste", async () => {
      const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
      const body = await res.json();
      assert(res.status === 200, `esperado 200, recebido ${res.status}`);
      assert(body.success === true && body.status === "sent", `resposta inesperada: ${JSON.stringify(body)}`);
      assert(body.delivered === 2 && body.total === 2, `contagem inesperada: ${JSON.stringify(body)}`);
      assert(mock.updates.length === 1, `agendamento deve avançar uma vez: ${JSON.stringify(mock.updates)}`);
      const payload = mock.updates[0].payload;
      assert(typeof payload.last_sent_at === "string" && payload.last_sent_at.length > 0,
        `last_sent_at ausente: ${JSON.stringify(payload)}`);
      assert(typeof payload.next_send_at === "string" && payload.next_send_at.length > 0,
        `next_send_at ausente: ${JSON.stringify(payload)}`);
    });
  } finally {
    resend.restore();
  }
});
