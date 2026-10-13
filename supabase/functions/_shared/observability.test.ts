// Item 034/035 (plano de paridade V1/V3) — correlation id, acesso fechado e texto
// Prometheus do módulo de observabilidade das edges.
//
// Prova que a lacuna "Sem health/status/metrics nem withRequestId" fechou:
// withRequestId ecoa/gera o id e correlaciona erro; authorizeObservability nega por
// padrão (401 sem identidade, 403 sem papel, fail-closed no CRON_SECRET vazio);
// renderPrometheus respeita o formato v0.0.4.
import {
  authorizeObservability,
  errorResponseWithRequestId,
  escapeLabelValue,
  renderPrometheus,
  resolveRequestId,
  resolveTraceId,
  withRequestId,
} from "./observability.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function reqWith(headers: Record<string, string> = {}, url = "https://edge.invalid/x") {
  return new Request(url, { headers });
}

/** Captura as linhas de `console.log`/`console.error` do escopo do handler. */
async function capturarLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const logOrig = console.log;
  const errOrig = console.error;
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  try {
    return { result: await fn(), logs };
  } finally {
    console.log = logOrig;
    console.error = errOrig;
  }
}

// ─── 034 · resolveRequestId ───────────────────────────────────────────────────

Deno.test("correlation: ecoa o x-request-id válido do cliente", () => {
  const id = resolveRequestId(reqWith({ "x-request-id": "chat-err-1234" }));
  assert(id === "chat-err-1234", `esperado eco do id do cliente, veio ${id}`);
});

Deno.test("correlation: gera UUID quando o cabeçalho não veio", () => {
  const id = resolveRequestId(reqWith());
  assert(UUID_RE.test(id), `esperado UUID gerado, veio ${id}`);
});

Deno.test("correlation: valor fora do formato é descartado (não ecoa espaço/meta-caractere)", () => {
  const id = resolveRequestId(reqWith({ "x-request-id": "id com espaço" }));
  assert(UUID_RE.test(id), `esperado id novo no lugar do inválido, veio ${id}`);
});

Deno.test("correlation: valor curto demais é descartado", () => {
  const id = resolveRequestId(reqWith({ "x-request-id": "curto" }));
  assert(UUID_RE.test(id), `esperado id novo no lugar do curto, veio ${id}`);
});

// ─── 034 · withRequestId ──────────────────────────────────────────────────────

Deno.test("withRequestId: passa o id ao handler, ecoa no cabeçalho e loga uma linha", async () => {
  let visto: string | undefined;
  let headerDoHandler: string | null = null;
  const handler = withRequestId("status", (req, ctx) => {
    visto = ctx.requestId;
    headerDoHandler = req.headers.get("x-request-id");
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  });

  const { result: res, logs } = await capturarLogs(() =>
    handler(reqWith({ "x-request-id": "corr-abc-123" }))
  );

  assert(visto === "corr-abc-123", `ctx.requestId divergiu: ${visto}`);
  assert(headerDoHandler === "corr-abc-123", `handler não viu o id na requisição: ${headerDoHandler}`);
  assert(res.headers.get("x-request-id") === "corr-abc-123", "resposta sem o eco do id");
  const linha = logs.find((l) => l.includes('"rid":"corr-abc-123"'));
  assert(linha !== undefined, `nenhuma linha estruturada com o rid: ${JSON.stringify(logs)}`);
  const parsed = JSON.parse(linha as string) as { fn?: string; status?: number };
  assert(parsed.fn === "status" && parsed.status === 200, `linha malformada: ${linha}`);
});

Deno.test("withRequestId: exceção do handler vira 500 com o MESMO id no envelope", async () => {
  const handler = withRequestId("metrics", () => {
    throw new Error("boom interno");
  });

  const { result: res, logs } = await capturarLogs(() =>
    handler(reqWith({ "x-request-id": "corr-erro-99" }))
  );

  assert(res.status === 500, `esperado 500, veio ${res.status}`);
  assert(res.headers.get("x-request-id") === "corr-erro-99", "resposta 500 sem o eco do id");
  const body = await res.json();
  assert(body.requestId === "corr-erro-99", `envelope sem o requestId: ${JSON.stringify(body)}`);
  assert(body.error === "Internal server error", `5xx não pode vazar a mensagem: ${JSON.stringify(body)}`);
  assert(JSON.stringify(logs).includes("boom interno"), "o erro real deve aparecer no log");
});

// ─── 034 · envelope de erro ───────────────────────────────────────────────────

Deno.test("errorResponseWithRequestId: 4xx mantém a mensagem e o requestId", async () => {
  const res = errorResponseWithRequestId("Forbidden", 403, reqWith(), "corr-403");
  assert(res.status === 403, `esperado 403, veio ${res.status}`);
  const body = await res.json();
  assert(body.error === "Forbidden" && body.requestId === "corr-403", JSON.stringify(body));
});

// ─── 034 · leitura do x-correlation-id e do traceparent (paridade com o wrapper) ──

Deno.test("correlation: lê o x-correlation-id quando só ele veio (nome canônico)", () => {
  const id = resolveRequestId(reqWith({ "x-correlation-id": "corr-canon-1234" }));
  assert(id === "corr-canon-1234", `esperado o id de x-correlation-id, veio ${id}`);
});

Deno.test("correlation: x-correlation-id tem precedência sobre x-request-id", () => {
  const id = resolveRequestId(reqWith({ "x-correlation-id": "corr-correl-1234", "x-request-id": "corr-request-1234" }));
  assert(id === "corr-correl-1234", `esperado x-correlation-id, veio ${id}`);
});

Deno.test("correlation: x-correlation-id inválido cai para o x-request-id válido", () => {
  const id = resolveRequestId(reqWith({ "x-correlation-id": "curto", "x-request-id": "corr-request-1234" }));
  assert(id === "corr-request-1234", `esperado o x-request-id no lugar do inválido, veio ${id}`);
});

Deno.test("correlation: sem os dois cabeçalhos gera id novo (comportamento antigo preservado)", () => {
  const id = resolveRequestId(reqWith({ "x-request-id": "corr-request-1234" }));
  assert(id === "corr-request-1234", `esperado o x-request-id, veio ${id}`);
  assert(UUID_RE.test(resolveRequestId(reqWith())), "sem cabeçalho deveria gerar UUID");
});

Deno.test("traceparent: lê o trace-id de um W3C v0 válido", () => {
  const traceId = resolveTraceId(reqWith({ traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" }));
  assert(traceId === "4bf92f3577b34da6a3ce929d0e0e4736", `trace-id divergiu: ${traceId}`);
});

Deno.test("traceparent: trace-id/parent-id tudo zero é inválido (W3C)", () => {
  assert(
    resolveTraceId(reqWith({ traceparent: "00-00000000000000000000000000000000-00f067aa0ba902b7-01" })) === null,
    "trace-id zero deveria ser descartado",
  );
  assert(
    resolveTraceId(reqWith({ traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01" })) === null,
    "parent-id zero deveria ser descartado",
  );
});

Deno.test("traceparent: versão diferente de 00 e valor malformado são ignorados", () => {
  assert(resolveTraceId(reqWith({ traceparent: "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" })) === null, "versão 01 não é v0");
  assert(resolveTraceId(reqWith({ traceparent: "00-curto-00f067aa0ba902b7-01" })) === null, "trace-id curto deveria falhar");
  assert(resolveTraceId(reqWith()) === null, "sem traceparent deveria ser null");
});

Deno.test("withRequestId: id canônico volta em X-Correlation-Id e no log", async () => {
  let ctxCorrelation: string | undefined;
  const handler = withRequestId("health", (_req, ctx) => {
    ctxCorrelation = ctx.correlationId;
    return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
  });

  const { result: res, logs } = await capturarLogs(() =>
    handler(reqWith({ "x-correlation-id": "corr-canon-9999" }))
  );

  assert(ctxCorrelation === "corr-canon-9999", `ctx.correlationId divergiu: ${ctxCorrelation}`);
  assert(res.headers.get("x-correlation-id") === "corr-canon-9999", "resposta sem X-Correlation-Id");
  assert(res.headers.get("x-request-id") === "corr-canon-9999", "resposta sem X-Request-ID casando");
  const linha = logs.find((l) => l.includes('"rid":"corr-canon-9999"'));
  assert(linha !== undefined, `nenhuma linha estruturada com o rid canônico: ${JSON.stringify(logs)}`);
});

Deno.test("withRequestId: trace-id do traceparent entra no log como traceId", async () => {
  const handler = withRequestId("metrics", (_req, ctx) => {
    return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
  });

  const { logs } = await capturarLogs(() =>
    handler(reqWith({
      "x-correlation-id": "corr-trace-1234",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    }))
  );

  const linha = logs.find((l) => l.includes('"rid":"corr-trace-1234"'));
  assert(linha !== undefined, `sem linha de conclusão: ${JSON.stringify(logs)}`);
  assert((linha as string).includes('"traceId":"4bf92f3577b34da6a3ce929d0e0e4736"'), `traceId ausente: ${linha}`);
});

Deno.test("errorResponseWithRequestId: devolve X-Correlation-Id e correlationId, com traceId quando há traceparent", async () => {
  const res = errorResponseWithRequestId(
    "Unauthorized",
    401,
    reqWith({ traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" }),
    "corr-401-abc",
  );
  assert(res.headers.get("x-correlation-id") === "corr-401-abc", "envelope sem o cabeçalho X-Correlation-Id");
  const body = await res.json();
  assert(body.correlationId === "corr-401-abc", `envelope sem correlationId: ${JSON.stringify(body)}`);
  assert(body.traceId === "4bf92f3577b34da6a3ce929d0e0e4736", `envelope sem traceId: ${JSON.stringify(body)}`);
});

Deno.test("errorResponseWithRequestId: sem traceparent não inventa traceId", async () => {
  const res = errorResponseWithRequestId("Forbidden", 403, reqWith(), "corr-403-xyz");
  const body = await res.json();
  assert(body.traceId === undefined, `não deveria ter traceId: ${JSON.stringify(body)}`);
});

// ─── 035 · authorizeObservability ─────────────────────────────────────────────

function authClient(opts: { user?: { id: string } | null; userError?: boolean; privileged?: boolean; roleError?: boolean } = {}) {
  return {
    auth: {
      getUser: (_token: string) => Promise.resolve({
        data: { user: opts.user ?? null },
        error: opts.userError || !opts.user ? new Error("token inválido") : null,
      }),
    },
    rpc: (_name: string, _args: Record<string, unknown>) => Promise.resolve({
      data: opts.roleError ? null : (opts.privileged ?? false),
      error: opts.roleError ? new Error("rpc falhou") : null,
    }),
  };
}

Deno.test("acesso: sem identidade nenhuma → 401", async () => {
  const denial = await authorizeObservability(reqWith(), { cronSecret: "segredo" });
  assert(denial?.status === 401, `esperado 401, veio ${JSON.stringify(denial)}`);
});

Deno.test("acesso: x-cron-secret errado → 401", async () => {
  const denial = await authorizeObservability(reqWith({ "x-cron-secret": "errado" }), { cronSecret: "segredo" });
  assert(denial?.status === 401, `esperado 401, veio ${JSON.stringify(denial)}`);
});

Deno.test("acesso: CRON_SECRET vazio não autoriza pelo cabeçalho (fail-closed)", async () => {
  const denial = await authorizeObservability(reqWith({ "x-cron-secret": "qualquer" }), { cronSecret: "" });
  assert(denial?.status === 401, `esperado 401, veio ${JSON.stringify(denial)}`);
});

Deno.test("acesso: x-cron-secret correto → liberado", async () => {
  const denial = await authorizeObservability(reqWith({ "x-cron-secret": "segredo" }), { cronSecret: "segredo" });
  assert(denial === null, `esperado null, veio ${JSON.stringify(denial)}`);
});

Deno.test("acesso: JWT inválido → 401 (mesma resposta de 'não existe')", async () => {
  const denial = await authorizeObservability(
    reqWith({ Authorization: "Bearer jwt-ruim" }),
    { authClient: authClient({ userError: true }) },
  );
  assert(denial?.status === 401, `esperado 401, veio ${JSON.stringify(denial)}`);
});

Deno.test("acesso: usuário autenticado sem papel → 403", async () => {
  const denial = await authorizeObservability(
    reqWith({ Authorization: "Bearer jwt-comum" }),
    { authClient: authClient({ user: { id: "u1" }, privileged: false }) },
  );
  assert(denial?.status === 403, `esperado 403, veio ${JSON.stringify(denial)}`);
});

Deno.test("acesso: erro na RPC de papel → 403 (não abre por falha)", async () => {
  const denial = await authorizeObservability(
    reqWith({ Authorization: "Bearer jwt-admin" }),
    { authClient: authClient({ user: { id: "u2" }, roleError: true }) },
  );
  assert(denial?.status === 403, `esperado 403, veio ${JSON.stringify(denial)}`);
});

Deno.test("acesso: admin/supervisor → liberado", async () => {
  const denial = await authorizeObservability(
    reqWith({ Authorization: "Bearer jwt-admin" }),
    { authClient: authClient({ user: { id: "u3" }, privileged: true }) },
  );
  assert(denial === null, `esperado null, veio ${JSON.stringify(denial)}`);
});

// ─── 035 · renderPrometheus ───────────────────────────────────────────────────

Deno.test("prometheus: HELP/TYPE uma vez por métrica e amostra com rótulo escapado", () => {
  const texto = renderPrometheus([
    { name: "zapp_edge_up", help: "de pé", type: "gauge", value: 1 },
    { name: "zapp_query_telemetry_events_24h", help: "consultas", type: "gauge", labels: { table: 'a"b' }, value: 7 },
  ]);
  const linhas = texto.split("\n").filter(Boolean);
  assert(linhas.filter((l) => l.startsWith("# HELP zapp_edge_up ")).length === 1, "HELP duplicado/ausente");
  assert(linhas.filter((l) => l === "# TYPE zapp_edge_up gauge").length === 1, "TYPE ausente");
  assert(texto.includes('zapp_edge_up 1'), "amostra sem valor");
  assert(texto.includes('table="a\\"b"'), `rótulo não escapado: ${texto}`);
  assert(texto.endsWith("\n"), "exposição deve terminar em nova linha");
});

Deno.test("prometheus: nome inválido falha alto em vez de gerar scrape inválido", () => {
  let falhou = false;
  try {
    renderPrometheus([{ name: "metric-with-dash", help: "x", type: "gauge", value: 1 }]);
  } catch {
    falhou = true;
  }
  assert(falhou, "nome fora do padrão deveria lançar");
});

Deno.test("prometheus: valor não finito falha alto", () => {
  let falhou = false;
  try {
    renderPrometheus([{ name: "zapp_edge_up", help: "x", type: "gauge", value: Number.NaN }]);
  } catch {
    falhou = true;
  }
  assert(falhou, "NaN deveria lançar");
});

Deno.test("escapeLabelValue: cobre barra invertida, aspas e quebra de linha", () => {
  assert(escapeLabelValue('a\\b"c\nd') === 'a\\\\b\\"c\\nd', escapeLabelValue('a\\b"c\nd'));
});
