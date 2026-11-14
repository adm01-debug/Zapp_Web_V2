/**
 * t_qa-sweep-isactive — ai-churn-analysis não reconsultava `profiles.is_active`
 * do chamador: um usuário DESATIVADO com JWT ainda válido (GoTrue não revoga o
 * token na hora) continuava rodando esta capacidade de IA até o token expirar.
 *
 * Mesmo padrão de `voice-agent/index.test.ts`: troca `Deno.serve` por um dublê
 * ANTES do import e captura o handler REAL; `globalThis.fetch` é o espião que
 * faz o papel de GoTrue e PostgREST. Sem rede, sem banco, env e segredos
 * sintéticos.
 *
 * Run with:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-churn-analysis/index.test.ts
 */

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SUPABASE = "https://stub.supabase.co";
const USER_ID = "11111111-2222-4333-8444-555555555555";

interface Chamada {
  url: string;
  metodo: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function cenario<T>(opts: { profileActive: boolean | null }, fn: (calls: Chamada[]) => Promise<T>): Promise<T> {
  const valores: Record<string, string> = {
    SUPABASE_URL: SUPABASE,
    SUPABASE_ANON_KEY: "anon-key-sintetica",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-sintetica-1234567890",
  };
  const salvos = Object.keys(valores).map((k) => [k, Deno.env.get(k)] as const);
  for (const [k, v] of Object.entries(valores)) Deno.env.set(k, v);
  const original = globalThis.fetch;
  const calls: Chamada[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const metodo = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ url, metodo });

    if (url.includes("/auth/v1/user")) return Promise.resolve(json({ id: USER_ID, aud: "authenticated" }));
    if (url.includes("/rest/v1/profiles") && url.includes("select=is_active")) {
      return Promise.resolve(json({ is_active: opts.profileActive }));
    }
    return Promise.resolve(new Response("nao stubado neste cenario", { status: 599 }));
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of salvos) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

function pedido(body: unknown): Request {
  return new Request("https://edge.invalid/functions/v1/ai-churn-analysis", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer jwt-sintetico" },
    body: JSON.stringify(body),
  });
}

Deno.test("perfil DESATIVADO (is_active=false) recebe 403 — nenhum contato é lido", async () => {
  await cenario({ profileActive: false }, async (calls) => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido({ contactIds: ["aaaaaaaa-0000-4000-8000-000000000001"] }));

    assert(res.status === 403, `perfil desativado deve receber 403, veio ${res.status}`);
    assert(
      !calls.some((c) => c.url.includes("/rest/v1/contacts") || c.url.includes("/rpc/")),
      `perfil desativado não pode disparar leitura de negócio nem a guarda de IA: ${JSON.stringify(calls)}`,
    );
  });
});

Deno.test("is_active nulo conta como inativo — 403", async () => {
  await cenario({ profileActive: null }, async () => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido({ contactIds: ["aaaaaaaa-0000-4000-8000-000000000001"] }));
    assert(res.status === 403, `is_active nulo deve receber 403, veio ${res.status}`);
  });
});
