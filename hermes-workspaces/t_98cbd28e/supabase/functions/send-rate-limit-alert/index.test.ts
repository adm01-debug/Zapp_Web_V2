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

// ── R2-API-057 — alerta/notificação não podem afirmar bloqueio que não persistiu ──
//
// Defeito: com blocked=true, a gravação em `blocked_ips` falha, mas o
// security_alert e a notification são enviados afirmando que o IP foi
// bloqueado (o IP segue liberado). Mock que CAPTURA o payload de cada escrita
// para conferir o texto realmente gravado pelo handler real.
function captureMock(opts: { admins?: unknown[]; blockError?: { message: string } | null } = {}) {
  const inserts: Record<string, unknown[]> = {};
  const fromCalls: string[] = [];
  const record = (table: string, payload: unknown) => {
    (inserts[table] ??= []).push(payload);
  };
  const builder = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      insert: (payload: unknown) => {
        record(table, payload);
        return Promise.resolve({ data: null, error: null });
      },
      upsert: (payload: unknown) => {
        record(table, payload);
        const error = table === "blocked_ips" ? (opts.blockError ?? null) : null;
        return Promise.resolve({ data: null, error });
      },
      select: () => b,
      eq: () => b,
      then: (resolve: (v: unknown) => void) => resolve({ data: opts.admins ?? [], error: null }),
    };
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = {
    from: (table: string) => {
      fromCalls.push(table);
      return builder(table);
    },
  };
  return { supabase, fromCalls, inserts };
}

function blockedPost() {
  return makePost({
    headers: { "X-Internal-Secret": "segredo" },
    body: { ip_address: "203.0.113.7", endpoint: "/api/teste", request_count: 99, blocked: true },
  });
}

Deno.test("R2-API-057: blocked=true + falha em blocked_ips → alerta e notificação NÃO afirmam bloqueio", async () => {
  const mock = captureMock({
    admins: [{ user_id: crypto.randomUUID() }],
    blockError: { message: "permission denied for table blocked_ips" },
  });
  const res = await handleRateLimitAlert(blockedPost(), {
    supabase: mock.supabase,
    internalSecret: "segredo",
  });
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);

  // O alerta de segurança continua registrado — mas sem afirmar bloqueio.
  const alerts = mock.inserts["security_alerts"] ?? [];
  assert(alerts.length === 1, `security_alerts deveria receber 1 registro: ${alerts.length}`);
  const alert = alerts[0] as Record<string, unknown>;
  assert(
    alert.alert_type === "rate_limit_warning",
    `alert_type não pode ser rate_limit_blocked com a gravação falha: ${JSON.stringify(alert.alert_type)}`,
  );
  assert(
    !String(alert.title).toLowerCase().includes("bloqueado"),
    `título do alerta não pode afirmar bloqueio: ${JSON.stringify(alert.title)}`,
  );
  assert(
    !String(alert.description).includes("O IP foi bloqueado"),
    `descrição do alerta não pode afirmar bloqueio: ${JSON.stringify(alert.description)}`,
  );

  // A notificação aos admins continua — mas sem dizer que o IP foi bloqueado.
  const notifs = mock.inserts["notifications"] ?? [];
  assert(notifs.length === 1, `notifications deveria receber 1 lote: ${notifs.length}`);
  const batch = notifs[0] as Array<Record<string, unknown>>;
  assert(batch.length === 1, `lote de notifications deveria ter 1 item: ${batch.length}`);
  assert(
    batch[0].title !== "IP Bloqueado",
    `notificação não pode dizer 'IP Bloqueado' quando a gravação falha: ${JSON.stringify(batch.map((n) => n.title))}`,
  );
});

Deno.test("R2-API-057: blocked=true + gravação OK → alerta e notificação AFIRMAM o bloqueio", async () => {
  const mock = captureMock({ admins: [{ user_id: crypto.randomUUID() }], blockError: null });
  const res = await handleRateLimitAlert(blockedPost(), {
    supabase: mock.supabase,
    internalSecret: "segredo",
  });
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);

  const alert = (mock.inserts["security_alerts"] ?? [])[0] as Record<string, unknown>;
  assert(
    alert.alert_type === "rate_limit_blocked",
    `alert_type deveria ser rate_limit_blocked com a gravação OK: ${JSON.stringify(alert?.alert_type)}`,
  );
  assert(
    String(alert.description).includes("O IP foi bloqueado"),
    `descrição deveria afirmar bloqueio quando persistiu: ${JSON.stringify(alert?.description)}`,
  );

  const batch = (mock.inserts["notifications"] ?? [])[0] as Array<Record<string, unknown>>;
  assert(
    batch[0].title === "IP Bloqueado",
    `notificação deveria dizer 'IP Bloqueado' quando persistiu: ${JSON.stringify(batch.map((n) => n.title))}`,
  );
});
