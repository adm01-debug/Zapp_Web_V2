/**
 * Contrato executável do `get-mapbox-token`.
 *
 * O index registra o handler com `Deno.serve` no nível do módulo e não o exporta:
 * o teste troca `Deno.serve` por um dublê ANTES do import e captura o handler REAL
 * (mesmo padrão de `classify-emoji/index.test.ts`). `globalThis.fetch` é o espião
 * que faz o papel de GoTrue e PostgREST (`requireAuth` + limite persistente) — sem
 * rede, sem banco, env e token sintéticos.
 *
 * Entrada: a função não lê corpo nem parâmetros, então não há caso de validação 400.
 *
 * Run with:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/get-mapbox-token/index.test.ts
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
const USER_ID = "11111111-2222-4333-8444-555555555555";
const TOKEN_MAPBOX = "pk.token-publico-sintetico";

interface Rotas {
  auth?: number;
  perfilAtivo?: boolean;
  limitePermitido?: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function cenario<T>(
  rotas: Rotas,
  fn: (urls: string[]) => Promise<T>,
  env: Record<string, string | undefined> = { MAPBOX_PUBLIC_TOKEN: TOKEN_MAPBOX },
): Promise<T> {
  const valores: Record<string, string | undefined> = {
    SUPABASE_URL: SUPABASE,
    SUPABASE_ANON_KEY: "anon-key-sintetica",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-sintetica",
    MAPBOX_PUBLIC_TOKEN: undefined,
    ...env,
  };
  const salvos = Object.keys(valores).map((k) => [k, Deno.env.get(k)] as const);
  for (const [k, v] of Object.entries(valores)) {
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    urls.push(url);
    if (url.includes("/auth/v1/user")) {
      const status = rotas.auth ?? 200;
      return Promise.resolve(
        status === 200 ? json({ id: USER_ID, aud: "authenticated" }) : json({ message: "invalid JWT" }, status),
      );
    }
    if (url.includes("/rest/v1/rpc/resolve_network_policy")) {
      return Promise.resolve(json([{ allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 }]));
    }
    if (url.includes("/rest/v1/profiles")) {
      return Promise.resolve(json({ is_active: rotas.perfilAtivo ?? true }));
    }
    if (url.includes("/rest/v1/rpc/consume_rate_limit")) {
      return Promise.resolve(json([{ allowed: rotas.limitePermitido ?? true, remaining: 0 }]));
    }
    return Promise.resolve(new Response("nao stubado", { status: 599 }));
  }) as typeof fetch;
  try {
    return await fn(urls);
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of salvos) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

function pedido(headers: Record<string, string> = { authorization: "Bearer jwt-sintetico" }, method = "GET"): Request {
  return new Request("https://edge.invalid/functions/v1/get-mapbox-token", { method, headers });
}

Deno.test("get-mapbox-token: preflight OPTIONS responde CORS sem consultar auth", async () => {
  await cenario({}, async (urls) => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido({}, "OPTIONS"));
    await res.body?.cancel();
    assertEquals(res.status, 200);
    assertEquals((res.headers.get("access-control-allow-headers") ?? "").includes("authorization"), true);
    assertEquals(urls.length, 0);
  });
});

Deno.test("get-mapbox-token: sem Authorization devolve 401 e não expõe o token", async () => {
  await cenario({}, async (urls) => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido({}));
    const texto = await res.text();
    assertEquals(res.status, 401);
    assertEquals(texto.includes(TOKEN_MAPBOX), false);
    assertEquals(urls.length, 0);
  });
});

Deno.test("get-mapbox-token: JWT recusado pelo GoTrue devolve 401", async () => {
  await cenario({ auth: 401 }, async (urls) => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido());
    const texto = await res.text();
    assertEquals(res.status, 401);
    assertEquals(texto.includes(TOKEN_MAPBOX), false);
    assertEquals(urls.some((u) => u.includes("/auth/v1/user")), true);
  });
});

Deno.test("get-mapbox-token: perfil inativo devolve 403", async () => {
  await cenario({ perfilAtivo: false }, async () => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido());
    const texto = await res.text();
    assertEquals(res.status, 403);
    assertEquals(texto.includes(TOKEN_MAPBOX), false);
  });
});

Deno.test("get-mapbox-token: caminho feliz devolve o token público", async () => {
  await cenario({}, async (urls) => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido());
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { token: TOKEN_MAPBOX });
    assertEquals(urls.some((u) => u.includes("/rest/v1/rpc/consume_rate_limit")), true);
  });
});

Deno.test("get-mapbox-token: limite por usuário excedido devolve 429", async () => {
  await cenario({ limitePermitido: false }, async () => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido());
    const texto = await res.text();
    assertEquals(res.status, 429);
    assertEquals(texto.includes(TOKEN_MAPBOX), false);
  });
});

Deno.test("get-mapbox-token: MAPBOX_PUBLIC_TOKEN ausente devolve 500", async () => {
  await cenario({}, async () => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido());
    await res.body?.cancel();
    assertEquals(res.status, 500);
  }, { MAPBOX_PUBLIC_TOKEN: undefined });
});
