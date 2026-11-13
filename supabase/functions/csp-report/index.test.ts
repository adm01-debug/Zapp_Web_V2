/**
 * Contrato executável do `csp-report` (receptor de violações de CSP).
 *
 * O index registra o handler com `Deno.serve` no nível do módulo e não o exporta:
 * o teste troca `Deno.serve` por um dublê ANTES do import e captura o handler REAL
 * (mesmo padrão de `classify-emoji/index.test.ts`). `globalThis.fetch` vira um espião
 * que responde só a RPC `consume_rate_limit` — sem rede, sem banco, env sintética.
 *
 * Autenticação: NÃO existe por desenho (o navegador manda o relatório sem JWT); o
 * que protege a rota é o limite por IP, coberto abaixo.
 *
 * Run with:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/csp-report/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type Handler = (req: Request) => Promise<Response>;

const DenoMutavel = Deno as unknown as { serve: (h: Handler) => unknown };
let handlerRegistrado: Handler | null = null;

async function handlerDaFuncao(): Promise<Handler> {
  if (handlerRegistrado) return handlerRegistrado;
  const original = DenoMutavel.serve;
  DenoMutavel.serve = (h) => {
    handlerRegistrado = h;
  };
  try {
    await import("./index.ts");
  } finally {
    DenoMutavel.serve = original;
  }
  if (!handlerRegistrado) throw new Error("index.ts nao registrou handler via Deno.serve");
  return handlerRegistrado;
}

const SUPABASE = "https://stub.supabase.co";

/** Env sintética + fetch espião: a RPC de limite responde `permitido`. */
async function cenario<T>(
  fn: (ctx: { rpcs: string[]; avisos: string[] }) => Promise<T>,
  limite: { allowed: boolean } = { allowed: true },
): Promise<T> {
  const salvos = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].map((k) => [k, Deno.env.get(k)] as const);
  Deno.env.set("SUPABASE_URL", SUPABASE);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-sintetica");
  const fetchOriginal = globalThis.fetch;
  const warnOriginal = console.warn;
  const rpcs: string[] = [];
  const avisos: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/rest/v1/rpc/consume_rate_limit")) {
      rpcs.push(url);
      return Promise.resolve(new Response(JSON.stringify([{ ...limite, remaining: 0 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    }
    return Promise.resolve(new Response("nao stubado", { status: 599 }));
  }) as typeof fetch;
  console.warn = (...args: unknown[]) => {
    avisos.push(args.map(String).join(" "));
  };
  try {
    return await fn({ rpcs, avisos });
  } finally {
    globalThis.fetch = fetchOriginal;
    console.warn = warnOriginal;
    for (const [k, v] of salvos) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

let ipSeq = 0;
function relatorio(body: BodyInit | null, headers: Record<string, string> = {}, method = "POST"): Request {
  ipSeq += 1;
  return new Request("https://edge.invalid/functions/v1/csp-report", {
    method,
    headers: { "content-type": "application/csp-report", "x-forwarded-for": `203.0.113.${ipSeq}`, ...headers },
    body,
  });
}

Deno.test("csp-report: preflight OPTIONS responde CORS sem consumir limite", async () => {
  await cenario(async ({ rpcs }) => {
    const handler = await handlerDaFuncao();
    const res = await handler(relatorio(null, {}, "OPTIONS"));
    await res.body?.cancel();
    assertEquals(res.status, 200);
    assertEquals((res.headers.get("access-control-allow-methods") ?? "").includes("POST"), true);
    assertEquals(rpcs.length, 0);
  });
});

Deno.test("csp-report: método diferente de POST devolve 405", async () => {
  await cenario(async ({ rpcs }) => {
    const handler = await handlerDaFuncao();
    const res = await handler(relatorio(null, {}, "GET"));
    await res.body?.cancel();
    assertEquals(res.status, 405);
    assertEquals(rpcs.length, 0);
  });
});

Deno.test("csp-report: IP acima do limite recebe 429 antes de ler o corpo", async () => {
  await cenario(async ({ avisos }) => {
    const handler = await handlerDaFuncao();
    const res = await handler(relatorio(JSON.stringify({ "csp-report": { "violated-directive": "img-src" } })));
    assertEquals(res.status, 429);
    assertEquals(avisos.some((a) => a.includes("csp violation")), false);
  }, { allowed: false });
});

Deno.test("csp-report: entrada inválida (JSON quebrado ou sem relatório) devolve 400", async () => {
  await cenario(async ({ avisos }) => {
    const handler = await handlerDaFuncao();
    for (const corpo of ["{nao-e-json", JSON.stringify({ outra: "coisa" }), JSON.stringify([{ type: "deprecation", body: {} }])]) {
      const res = await handler(relatorio(corpo));
      assertEquals(res.status, 400, `corpo: ${corpo}`);
    }
    assertEquals(avisos.some((a) => a.includes("csp violation")), false);
  });
});

Deno.test("csp-report: corpo acima de 8 KiB devolve 413 (declarado ou em stream)", async () => {
  await cenario(async () => {
    const handler = await handlerDaFuncao();
    const grande = JSON.stringify({ "csp-report": { "original-policy": "x".repeat(9000) } });
    const declarado = await handler(relatorio(grande, { "content-length": String(grande.length) }));
    assertEquals(declarado.status, 413);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(grande));
        c.close();
      },
    });
    const semTamanho = await handler(relatorio(stream));
    assertEquals(semTamanho.status, 413);
  });
});

Deno.test("csp-report: relatório legado vira log 204 com URL sem query/fragmento", async () => {
  await cenario(async ({ avisos, rpcs }) => {
    const handler = await handlerDaFuncao();
    const res = await handler(relatorio(JSON.stringify({
      "csp-report": {
        "document-uri": "https://app.exemplo.test/inbox?code=segredo-oauth#token",
        "violated-directive": "img-src",
        "blocked-uri": "https://cdn.terceiro.test/pixel.gif?uid=123",
        "line-number": 42,
      },
    })));
    assertEquals(res.status, 204);
    assertEquals(rpcs.length, 1);
    const log = avisos.find((a) => a.includes("csp violation")) ?? "";
    assertEquals(log.includes("https://app.exemplo.test/inbox"), true);
    assertEquals(log.includes("https://cdn.terceiro.test/pixel.gif"), true);
    assertEquals(log.includes("segredo-oauth"), false);
    assertEquals(log.includes("uid=123"), false);
    assertEquals(log.includes("img-src"), true);
  });
});

Deno.test("csp-report: Reporting API (array) registra só csp-violation, até 10 por pedido", async () => {
  await cenario(async ({ avisos }) => {
    const handler = await handlerDaFuncao();
    const entradas = [
      { type: "deprecation", body: { id: "x" } },
      ...Array.from({ length: 12 }, (_, i) => ({
        type: "csp-violation",
        body: { effectiveDirective: "script-src", blockedURL: `https://evil.test/s${i}.js?q=1` },
      })),
    ];
    const res = await handler(relatorio(JSON.stringify(entradas), { "content-type": "application/reports+json" }));
    assertEquals(res.status, 204);
    const logs = avisos.filter((a) => a.includes("csp violation"));
    assertEquals(logs.length, 10);
    assertEquals(logs.every((l) => l.includes("script-src") && !l.includes("q=1")), true);
  });
});
