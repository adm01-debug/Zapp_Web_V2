// Item 035 (plano de paridade V1/V3) — edge `metrics` (Prometheus v0.0.4).
//
// Prova o aceite: o scrape devolve texto Prometheus válido; acesso fechado por padrão;
// falha de leitura vira 503 com `zapp_edge_up 0` em vez de 200 silencioso.
import { handleMetrics } from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

interface GteArgs { table: string; column: string; value: string }

/** Cliente service-role falso: registra a coluna e o corte de cada contagem. */
function supabaseMock(opts: { error?: Error | null; counts?: Record<string, number> } = {}) {
  const gte: GteArgs[] = [];
  const supabase = {
    from(table: string) {
      return {
        select: () => ({
          gte: (column: string, value: string) => {
            gte.push({ table, column, value });
            return Promise.resolve({ count: opts.counts?.[table] ?? 0, error: opts.error ?? null });
          },
        }),
      };
    },
  };
  return { supabase, gte };
}

const req = (headers: Record<string, string> = {}) =>
  new Request("https://edge.invalid/metrics", { headers });

const AGORA = Date.parse("2026-10-08T12:00:00.000Z");

Deno.test("metrics: sem identidade → 401 e nenhuma consulta", async () => {
  const mock = supabaseMock();
  const res = await handleMetrics(req(), { supabase: mock.supabase, auth: { cronSecret: "segredo" }, now: () => AGORA });
  assert(res.status === 401, `esperado 401, veio ${res.status}`);
  assert(mock.gte.length === 0, `não deveria consultar o banco: ${JSON.stringify(mock.gte)}`);
});

Deno.test("metrics: segredo interno vazio não autoriza (fail-closed)", async () => {
  const mock = supabaseMock();
  const res = await handleMetrics(req({ "x-cron-secret": "qualquer" }), {
    supabase: mock.supabase, auth: { cronSecret: "" }, now: () => AGORA,
  });
  assert(res.status === 401, `esperado 401, veio ${res.status}`);
  assert(mock.gte.length === 0, "não deveria consultar o banco");
});

Deno.test("metrics: cron válido → texto Prometheus com as contagens", async () => {
  const mock = supabaseMock({ counts: { webhook_rate_limits: 12, rate_limit_logs: 3, query_telemetry: 40 } });
  const res = await handleMetrics(req({ "x-cron-secret": "segredo" }), {
    supabase: mock.supabase, auth: { cronSecret: "segredo" }, now: () => AGORA,
  });

  assert(res.status === 200, `esperado 200, veio ${res.status}`);
  assert(res.headers.get("content-type") === "text/plain; version=0.0.4; charset=utf-8",
    `content-type inesperado: ${res.headers.get("content-type")}`);

  const texto = await res.text();
  assert(texto.includes("# TYPE zapp_edge_up gauge"), "TYPE do zapp_edge_up ausente");
  assert(texto.includes("zapp_edge_up 1"), "zapp_edge_up deveria ser 1");
  assert(texto.includes("zapp_webhook_rate_limit_rows_24h 12"), `contagem de webhook ausente: ${texto}`);
  assert(texto.includes("zapp_rate_limit_events_24h 3"), `contagem de rate limit ausente: ${texto}`);
  assert(texto.includes("zapp_query_telemetry_events_24h 40"), `contagem de telemetria ausente: ${texto}`);
  assert(texto.endsWith("\n"), "exposição deve terminar em nova linha");
});

Deno.test("metrics: a janela é de 24h sobre o relógio injetado", async () => {
  const mock = supabaseMock();
  await handleMetrics(req({ "x-cron-secret": "segredo" }), {
    supabase: mock.supabase, auth: { cronSecret: "segredo" }, now: () => AGORA,
  });
  assert(mock.gte.length === 3, `esperado 3 contagens, veio ${mock.gte.length}`);
  const esperado = new Date(AGORA - 24 * 60 * 60 * 1000).toISOString();
  for (const call of mock.gte) {
    assert(call.value === esperado, `corte divergente em ${call.table}: ${call.value} != ${esperado}`);
  }
  const colunas = Object.fromEntries(mock.gte.map((c) => [c.table, c.column]));
  assert(colunas.webhook_rate_limits === "window_start", "coluna de janela errada para webhook_rate_limits");
  assert(colunas.rate_limit_logs === "created_at", "coluna de janela errada para rate_limit_logs");
  assert(colunas.query_telemetry === "created_at", "coluna de janela errada para query_telemetry");
});

Deno.test("metrics: leitura que falha → 503 com zapp_edge_up 0 (não 200 vazio)", async () => {
  const mock = supabaseMock({ error: new Error("connection refused") });
  const res = await handleMetrics(req({ "x-cron-secret": "segredo" }), {
    supabase: mock.supabase, auth: { cronSecret: "segredo" }, now: () => AGORA,
  });
  assert(res.status === 503, `esperado 503, veio ${res.status}`);
  const texto = await res.text();
  assert(texto.includes("zapp_edge_up 0"), `deveria sinalizar queda: ${texto}`);
  assert(!texto.includes("connection refused"), "503 não pode vazar o erro do driver");
});
