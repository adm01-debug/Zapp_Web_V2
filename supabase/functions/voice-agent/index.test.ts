/**
 * Contrato executável do `voice-agent` (comando de voz → ação estruturada).
 *
 * O index registra o handler com `Deno.serve` no nível do módulo e não o exporta:
 * o teste troca `Deno.serve` por um dublê ANTES do import e captura o handler REAL
 * (mesmo padrão de `classify-emoji/index.test.ts`). `globalThis.fetch` é o espião
 * que faz o papel de GoTrue, PostgREST e do provedor de IA. Sem rede, sem banco,
 * env, segredos e provedor sintéticos. Cota compartilhada e orçamento (RPCs)
 * respondem erro de infraestrutura — o desenho deles é falha ABERTA e não é o que
 * está em prova aqui.
 *
 * Run with:
 *   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/voice-agent/index.test.ts
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
const SERVICE_KEY = "service-role-sintetica-1234567890";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const PROVEDOR = "https://provedor-ia.test/v1/chat/completions";
const SEGREDO_PROVEDOR = "CHAVE_PROVEDOR_VOZ_TESTE";

const PROVEDOR_PADRAO = {
  id: "00000000-0000-4000-8000-0000000000bb",
  name: "Provedor de Teste",
  provider_type: "openai_compatible",
  api_endpoint: PROVEDOR,
  api_key_secret_name: SEGREDO_PROVEDOR,
  model: "modelo-teste",
  system_prompt: null,
  config: {},
  is_active: true,
  is_default: true,
  use_for: ["copilot"],
};

interface Chamada {
  url: string;
  metodo: string;
  corpo: unknown;
}

interface Rotas {
  /** Resposta do provedor de IA. */
  provedor?: () => Response;
  /** Flag `voice` em `feature_flags`. */
  capacidadeLigada?: boolean;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

async function cenario<T>(rotas: Rotas, fn: (calls: Chamada[]) => Promise<T>): Promise<T> {
  const valores: Record<string, string> = {
    SUPABASE_URL: SUPABASE,
    SUPABASE_ANON_KEY: "anon-key-sintetica",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    [SEGREDO_PROVEDOR]: "segredo-de-provedor-sintetico",
  };
  const salvos = Object.keys(valores).map((k) => [k, Deno.env.get(k)] as const);
  for (const [k, v] of Object.entries(valores)) Deno.env.set(k, v);
  const original = globalThis.fetch;
  const calls: Chamada[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const metodo = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let corpo: unknown = null;
    if (typeof init?.body === "string") {
      try {
        corpo = JSON.parse(init.body);
      } catch {
        corpo = init.body;
      }
    }
    calls.push({ url, metodo, corpo });

    if (url.includes("/auth/v1/user")) return Promise.resolve(json({ id: USER_ID, aud: "authenticated" }));
    if (url.includes("/rest/v1/rpc/resolve_network_policy")) {
      return Promise.resolve(json([{ allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 }]));
    }
    // Cota compartilhada / orçamento: erro de infraestrutura → falha aberta por desenho.
    if (url.includes("/rest/v1/rpc/")) return Promise.resolve(json({ code: "PGRST000", message: "rpc indisponivel no stub" }, 400));
    if (url.includes("/rest/v1/feature_flags")) return Promise.resolve(json({ enabled: rotas.capacidadeLigada ?? true }));
    if (url.includes("/rest/v1/ai_usage_logs") && metodo !== "POST") {
      return Promise.resolve(new Response(null, { status: 200, headers: { "content-range": "*/0" } }));
    }
    if (url.includes("/rest/v1/ai_usage_logs")) return Promise.resolve(json({}, 201));
    if (url.includes("/rest/v1/profiles") && url.includes("select=is_active")) return Promise.resolve(json({ is_active: true }));
    if (url.includes("/rest/v1/profiles")) return Promise.resolve(json({ id: "perfil-sintetico" }));
    if (url.includes("/rest/v1/ai_providers")) return Promise.resolve(json([PROVEDOR_PADRAO]));
    if (url.startsWith(PROVEDOR)) {
      return Promise.resolve((rotas.provedor ?? (() => new Response("sem stub de provedor", { status: 599 })))());
    }
    return Promise.resolve(new Response("nao stubado", { status: 599 }));
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

function pedido(body: unknown, authorization: string | null = "Bearer jwt-sintetico", method = "POST"): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization) headers.authorization = authorization;
  return new Request("https://edge.invalid/functions/v1/voice-agent", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : null,
  });
}

const chamadasAoProvedor = (calls: Chamada[]) => calls.filter((c) => c.url.startsWith(PROVEDOR));

function respostaComFerramenta(args: unknown): Response {
  return json({
    model: "modelo-teste",
    choices: [{ message: { tool_calls: [{ function: { name: "execute_voice_command", arguments: JSON.stringify(args) } }] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
}

Deno.test("voice-agent: preflight OPTIONS responde CORS sem rede", async () => {
  await cenario({}, async (calls) => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido(null, null, "OPTIONS"));
    await res.body?.cancel();
    assertEquals(res.status, 200);
    assertEquals((res.headers.get("access-control-allow-headers") ?? "").includes("authorization"), true);
    assertEquals(calls.length, 0);
  });
});

Deno.test("voice-agent: sem Authorization devolve 401 sem rede", async () => {
  await cenario({}, async (calls) => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido({ transcript: "abrir inbox" }, null));
    await res.body?.cancel();
    assertEquals(res.status, 401);
    assertEquals(calls.length, 0);
  });
});

Deno.test("voice-agent: credencial service role é recusada com 403", async () => {
  await cenario({}, async (calls) => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido({ transcript: "abrir inbox" }, `Bearer ${SERVICE_KEY}`));
    await res.body?.cancel();
    assertEquals(res.status, 403);
    assertEquals(calls.length, 0);
  });
});

Deno.test("voice-agent: capacidade de voz desligada devolve 503 sem chamar o provedor", async () => {
  await cenario({ capacidadeLigada: false }, async (calls) => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido({ transcript: "abrir inbox" }));
    await res.body?.cancel();
    assertEquals(res.status, 503);
    assertEquals(chamadasAoProvedor(calls).length, 0);
  });
});

Deno.test("voice-agent: transcrição ausente, vazia ou longa demais devolve 400 sem chamar o provedor", async () => {
  await cenario({ provedor: () => respostaComFerramenta({ action: "answer", response: "x" }) }, async (calls) => {
    const handler = await handlerDaFuncao();
    for (const body of [{}, { transcript: "" }, { transcript: "a".repeat(2001) }, { transcript: 42 }]) {
      const res = await handler(pedido(body));
      await res.body?.cancel();
      assertEquals(res.status, 400, `body: ${JSON.stringify(body).slice(0, 40)}`);
    }
    assertEquals(chamadasAoProvedor(calls).length, 0);
  });
});

Deno.test("voice-agent: caminho feliz devolve a ação do provedor sanitizada", async () => {
  await cenario({
    provedor: () =>
      respostaComFerramenta({
        action: "navigate",
        response: "Abrindo a caixa de entrada.",
        data: { route: "inbox", sortBy: "inexistente", filters: { sentiment: "furioso", unread: true } },
      }),
  }, async (calls) => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido({ transcript: "  abrir a caixa de entrada  " }));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), {
      action: "navigate",
      response: "Abrindo a caixa de entrada.",
      data: { route: "inbox", filters: { unread: true } },
    });
    const provedor = chamadasAoProvedor(calls);
    assertEquals(provedor.length, 1);
    const corpo = provedor[0].corpo as { messages?: Array<{ role: string; content: string }>; tools?: unknown[] };
    assertEquals(corpo.messages?.at(-1), { role: "user", content: "abrir a caixa de entrada" });
    assertEquals(Array.isArray(corpo.tools) && corpo.tools.length === 1, true);
  });
});

Deno.test("voice-agent: ação/rota fora da lista viram 'answer' sem rota", async () => {
  await cenario({
    provedor: () => respostaComFerramenta({ action: "delete_all", response: "Feito.", data: { route: "../admin" } }),
  }, async () => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido({ transcript: "apague tudo" }));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { action: "answer", response: "Feito.", data: {} });
  });
});

Deno.test("voice-agent: provedor com 429 devolve 429", async () => {
  await cenario({ provedor: () => json({ error: "rate limited" }, 429) }, async () => {
    const handler = await handlerDaFuncao();
    const res = await handler(pedido({ transcript: "abrir inbox" }));
    await res.body?.cancel();
    assertEquals(res.status, 429);
  });
});
