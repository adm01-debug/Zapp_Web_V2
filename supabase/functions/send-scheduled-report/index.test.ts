// R2-API-022 (P1) — gate de autorização do send-scheduled-report.
//
// Aceite: 401 sem identidade; 403 para usuário comum; cron inválido/ausente
// rejeitado; admin/supervisor e cron válido admitidos; zero lookup de
// relatório / Resend / efeito service-role após rejeição; usuário comum não
// recebe reportData.
import { handleScheduledReport, isTrustedRecipient, resolveTrustedDomains } from "./index.ts";

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
  slaRows?: unknown[];
} = {}) {
  const fromCalls: string[] = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  let currentTable = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qb: any = {
    select: () => qb,
    // `.gte()` é o terminal da consulta de SLA; roteia para as linhas semeadas
    // quando o teste as fornece (senão mantém o encadeamento antigo).
    gte: () => (opts.slaRows === undefined ? qb : Promise.resolve({ data: opts.slaRows, error: null })),
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
  const mock = serviceMock({ report: reportWith(["a@promobrindes.com.br", "b@promobrindes.com.br"]) });
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
  const mock = serviceMock({ report: reportWith(["aceito@promobrindes.com.br", "recusado@promobrindes.com.br"]) });
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
      assert(JSON.stringify(resend.recipients) === JSON.stringify(["aceito@promobrindes.com.br", "recusado@promobrindes.com.br"]),
        `cada destinatário original deve ser tentado uma vez: ${JSON.stringify(resend.recipients)}`);
      assert(JSON.stringify(body.failed_recipients) === JSON.stringify(["recusado@promobrindes.com.br"]),
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
  const mock = serviceMock({ report: reportWith(["a@promobrindes.com.br"]) });
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
    report: reportWith(["a@promobrindes.com.br"]),
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
  const mock = serviceMock({ report: reportWith(["a@promobrindes.com.br"]), updateRows: [] });
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

// ─────────────────────────────────────────────────────────────────────────────
// R2-SLA-001 / #458 — o relatório agendado de SLA usa a MESMA regra de
// elegibilidade do painel/histórico (src/hooks/sla/slaFirstResponse.ts):
// pendentes ficam fora do numerador E do denominador; sem avaliadas não há taxa
// (nunca 100%). A taxa de resolução sai do relatório.
// ─────────────────────────────────────────────────────────────────────────────

function slaReport() {
  return { id: crypto.randomUUID(), report_type: "sla_compliance", recipients: [], frequency: "daily" };
}

function pendingRow() {
  return { first_response_breached: false, first_response_at: null };
}

Deno.test("sla: pendente não entra no denominador nem no numerador (1 violada + 9 pendentes → 0%)", async () => {
  const mock = serviceMock({
    report: slaReport(),
    slaRows: [{ first_response_breached: true, first_response_at: null }, ...Array.from({ length: 9 }, pendingRow)],
  });
  const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const data = body.reportData;
  assert(data.evaluatedConversations === 1, `avaliadas deve ser 1: ${JSON.stringify(data)}`);
  assert(data.onTimeResponses === 0, `no prazo deve ser 0: ${JSON.stringify(data)}`);
  assert(data.responseBreaches === 1, `violações deve ser 1: ${JSON.stringify(data)}`);
  assert(data.pendingResponses === 9, `pendentes deve ser 9: ${JSON.stringify(data)}`);
  assert(data.responseComplianceRate === "0%", `taxa deve ser 0% (não 90%): ${JSON.stringify(data)}`);
  assert(!("resolutionComplianceRate" in data), `taxa de resolução não pode existir: ${JSON.stringify(data)}`);
  assert(!("resolutionBreaches" in data), `violações de resolução não podem existir: ${JSON.stringify(data)}`);
  assert(!("totalConversations" in data), `total bruto não pode existir: ${JSON.stringify(data)}`);
});

Deno.test("sla: sem nenhuma avaliada → taxa 'N/A' e pendentes à parte (nunca 100%)", async () => {
  const mock = serviceMock({
    report: slaReport(),
    slaRows: Array.from({ length: 3 }, pendingRow),
  });
  const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const data = body.reportData;
  assert(data.evaluatedConversations === 0, `avaliadas deve ser 0: ${JSON.stringify(data)}`);
  assert(data.pendingResponses === 3, `pendentes deve ser 3: ${JSON.stringify(data)}`);
  assert(data.responseComplianceRate === "N/A", `taxa deve ser "N/A": ${JSON.stringify(data)}`);
});

Deno.test("sla: taxa = no prazo / avaliadas (2 no prazo + 1 violada → 67%)", async () => {
  const mock = serviceMock({
    report: slaReport(),
    slaRows: [
      { first_response_breached: false, first_response_at: "2026-10-12T10:00:00Z" },
      { first_response_breached: false, first_response_at: "2026-10-12T11:00:00Z" },
      { first_response_breached: true, first_response_at: null },
    ],
  });
  const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
  const body = await res.json();
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  const data = body.reportData;
  assert(data.evaluatedConversations === 3, `avaliadas deve ser 3: ${JSON.stringify(data)}`);
  assert(data.onTimeResponses === 2, `no prazo deve ser 2: ${JSON.stringify(data)}`);
  assert(data.responseComplianceRate === "67%", `taxa deve ser 67%: ${JSON.stringify(data)}`);
});

Deno.test("envio: todos aceitos → avança last_sent_at/next_send_at e responde sucesso", async () => {
  const mock = serviceMock({ report: reportWith(["a@promobrindes.com.br", "b@promobrindes.com.br"]) });
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

// ─────────────────────────────────────────────────────────────────────────────
// PD-23 / DD5 (docs 04–16) — o relatório agendado só envia para o domínio da
// empresa. Antes, qualquer string em `recipients` era aceita e o sistema
// mandava dado para fora. Aceite: e-mail inválido OU domínio fora da lista
// confiável é recusado, a recusa é registrada só em CONTAGEM (nunca o en-
// dereço), nada sai para o recusado e, se houver recusa, o ciclo segue a regra
// (nada permitido = não avança; parcial permitido = avança só o permitido).
// O default da lista é `promobrindes.com.br`, a mesma GUC de signup
// (`app.settings.trusted_domains`), espelhada no env `TRUSTED_EMAIL_DOMAINS`.
// ─────────────────────────────────────────────────────────────────────────────

/** Define/limpa TRUSTED_EMAIL_DOMAINS durante o teste e restaura o valor anterior. */
async function withTrustedDomainsEnv<T>(value: string | null, fn: () => Promise<T>): Promise<T> {
  const previous = Deno.env.get("TRUSTED_EMAIL_DOMAINS");
  if (value === null) Deno.env.delete("TRUSTED_EMAIL_DOMAINS");
  else Deno.env.set("TRUSTED_EMAIL_DOMAINS", value);
  try {
    return await fn();
  } finally {
    if (previous === undefined) Deno.env.delete("TRUSTED_EMAIL_DOMAINS");
    else Deno.env.set("TRUSTED_EMAIL_DOMAINS", previous);
  }
}

Deno.test("pd23: domínio externo → nada é enviado, ciclo não avança e a resposta não expõe o endereço", async () => {
  const EXTERNO = "externo@gmail.com";
  const mock = serviceMock({ report: reportWith([EXTERNO]) });
  const resend = withResendStub([200]);
  try {
    await withResendKey("chave-de-teste", async () => {
      const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
      const body = await res.json();
      assert(res.status === 422, `esperado 422, recebido ${res.status}`);
      assert(body.success !== true, `não pode ser sucesso: ${JSON.stringify(body)}`);
      assert(body.rejected === 1, `rejected deve ser 1: ${JSON.stringify(body)}`);
      assert(resend.calls.length === 0, `não pode chamar o provedor para domínio externo: ${JSON.stringify(resend.calls)}`);
      assert(mock.updates.length === 0, `ciclo não pode avançar: ${JSON.stringify(mock.updates)}`);
      assert(!JSON.stringify(body).includes(EXTERNO),
        `a resposta não pode conter o endereço recusado (dado pessoal): ${JSON.stringify(body)}`);
    });
  } finally {
    resend.restore();
  }
});

Deno.test("pd23: misto → só o destinatário confiável é enviado; o externo vira contagem, sem endereço", async () => {
  const EXTERNO = "externo@gmail.com";
  const OK = "ok@promobrindes.com.br";
  const mock = serviceMock({ report: reportWith([OK, EXTERNO]) });
  const resend = withResendStub([200]);
  try {
    await withResendKey("chave-de-teste", async () => {
      const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
      const body = await res.json();
      assert(res.status === 200, `esperado 200, recebido ${res.status}`);
      assert(body.success === true && body.status === "sent", `resposta inesperada: ${JSON.stringify(body)}`);
      assert(body.delivered === 1 && body.total === 1 && body.rejected === 1,
        `contagem inesperada: ${JSON.stringify(body)}`);
      assert(JSON.stringify(resend.recipients) === JSON.stringify([OK]),
        `só o confiável deve ser tentado: ${JSON.stringify(resend.recipients)}`);
      assert(mock.updates.length === 1, `ciclo deve avançar uma vez: ${JSON.stringify(mock.updates)}`);
      assert(!JSON.stringify(body).includes(EXTERNO),
        `a resposta não pode conter o endereço recusado: ${JSON.stringify(body)}`);
    });
  } finally {
    resend.restore();
  }
});

Deno.test("pd23: e-mail inválido (sem @) é recusado junto ao domínio", async () => {
  const mock = serviceMock({ report: reportWith(["sem-arroba", "ok@promobrindes.com.br"]) });
  const resend = withResendStub([200]);
  try {
    await withResendKey("chave-de-teste", async () => {
      const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
      const body = await res.json();
      assert(body.rejected === 1 && body.delivered === 1 && body.total === 1,
        `contagem inesperada: ${JSON.stringify(body)}`);
      assert(JSON.stringify(resend.recipients) === JSON.stringify(["ok@promobrindes.com.br"]),
        `só o válido deve ser tentado: ${JSON.stringify(resend.recipients)}`);
    });
  } finally {
    resend.restore();
  }
});

Deno.test("pd23: acima do limite de destinatários → nada é enviado e o ciclo não avança", async () => {
  const vinteUm = Array.from({ length: 21 }, (_, i) => `user${i}@promobrindes.com.br`);
  const mock = serviceMock({ report: reportWith(vinteUm) });
  const resend = withResendStub([200]);
  try {
    await withResendKey("chave-de-teste", async () => {
      const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
      const body = await res.json();
      assert(res.status === 422, `esperado 422, recebido ${res.status}`);
      assert(body.success !== true, `não pode ser sucesso: ${JSON.stringify(body)}`);
      assert(resend.calls.length === 0, `não pode enviar acima do limite: ${resend.calls.length}`);
      assert(mock.updates.length === 0, `ciclo não pode avançar: ${JSON.stringify(mock.updates)}`);
    });
  } finally {
    resend.restore();
  }
});

Deno.test("pd23: env TRUSTED_EMAIL_DOMAINS troca a lista confiável", async () => {
  await withTrustedDomainsEnv("parceiro.com.br", async () => {
    const mock = serviceMock({ report: reportWith(["parceiro@parceiro.com.br", "empresa@promobrindes.com.br"]) });
    const resend = withResendStub([200]);
    try {
      await withResendKey("chave-de-teste", async () => {
        const res = await handleScheduledReport(cronPost(), { supabase: mock.supabase, cronSecret: "segredo" });
        const body = await res.json();
        assert(body.delivered === 1 && body.rejected === 1, `contagem inesperada: ${JSON.stringify(body)}`);
        assert(JSON.stringify(resend.recipients) === JSON.stringify(["parceiro@parceiro.com.br"]),
          `só o domínio do env deve sair: ${JSON.stringify(resend.recipients)}`);
      });
    } finally {
      resend.restore();
    }
  });
});

Deno.test("pd23: default é o domínio da empresa; vazio cai no default e a normalização trata vírgula/caixa", () => {
  assert(JSON.stringify(resolveTrustedDomains(undefined)) === JSON.stringify(["promobrindes.com.br"]),
    `default inesperado: ${JSON.stringify(resolveTrustedDomains(undefined))}`);
  assert(JSON.stringify(resolveTrustedDomains("")) === JSON.stringify(["promobrindes.com.br"]),
    "vazio deve cair no default (falha fechada)");
  assert(JSON.stringify(resolveTrustedDomains(" @A.com , b.com,,C.com ")) === JSON.stringify(["a.com", "b.com", "c.com"]),
    `normalização inesperada: ${JSON.stringify(resolveTrustedDomains(" @A.com , b.com,,C.com "))}`);
});

Deno.test("pd23: aceita caixa alta, recusa subdomínio, dois @ e sem parte local", () => {
  const dominios = resolveTrustedDomains(undefined);
  assert(isTrustedRecipient("User@PromoBrindes.com.BR", dominios), "deve aceitar domínio em caixa alta");
  assert(isTrustedRecipient("@promobrindes.com.br", dominios) === false, "sem parte local deve recusar");
  assert(isTrustedRecipient("a@b@promobrindes.com.br", dominios) === false, "dois @ deve recusar");
  assert(isTrustedRecipient("a@sub.promobrindes.com.br", dominios) === false, "subdomínio não é o mesmo domínio");
  assert(isTrustedRecipient("a@gmail.com", dominios) === false, "domínio externo deve recusar");
  assert(isTrustedRecipient(42, dominios) === false, "valor não-string deve recusar");
});
