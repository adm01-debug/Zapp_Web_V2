// LAC P2 (doc 07, achado de voz): a chamada ao provedor PAGO não tinha prazo —
// uma rede travada deixava a request pendurada segurando o limite de taxa do
// usuário e o consumo pago escapava do ledger em qualquer erro.
//
// Aceite:
//   - prazo estourado no provedor -> 504 CLARO (código AI_TIMEOUT) e SEM vazar o
//     detalhe interno (o corpo de um 5xx do `errorResponse` viraria
//     "Internal server error");
//   - a chamada ao provedor leva `AbortSignal` (o prazo);
//   - o ledger de custo registra a tentativa MESMO em timeout (status error).
//
// A prova roda o handler REAL com o `fetch` global stubado por trecho de URL:
// `/auth/v1/user` (requireAuth), `/rest/v1/rpc/consume_rate_limit`
// (enforceRateLimit), `/rest/v1/ai_usage_logs` (ledger) e `api.elevenlabs.io`
// (o provedor, que aqui estoura o prazo).
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/elevenlabs-scribe-token/index.test.ts

import { handleElevenLabsScribeToken } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "20000000-0000-0000-0000-00000000000e";

type Route = { match: string; make: () => Response | Promise<Response> };
type Call = { url: string; init?: RequestInit };

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Stuba o `fetch` global e devolve todas as chamadas (URL + init) capturadas. */
function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    calls.push({ url, init });
    if (url.includes("/rest/v1/rpc/resolve_network_policy")) {
      return Promise.resolve(jsonResp([
        { allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 },
      ]));
    }
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return Promise.resolve(new Response("nao stubado", { status: 599 }));
    return Promise.resolve(route.make());
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const ROTA_AUTH: Route = {
  match: "/auth/v1/user",
  make: () => jsonResp({ id: USER_ID, aud: "authenticated" }),
};
const ROTA_RATE_LIMIT: Route = {
  match: "/rest/v1/rpc/consume_rate_limit",
  make: () => jsonResp([{ allowed: true, remaining: 9 }]),
};
const ROTA_LEDGER: Route = {
  match: "/rest/v1/ai_usage_logs",
  make: () => jsonResp([], 201),
};
/** O provedor pago estoura o prazo: `fetch` rejeita como `AbortError`. */
const ROTA_TIMEOUT: Route = {
  match: "api.elevenlabs.io",
  make: () => Promise.reject(new DOMException("The operation was aborted.", "AbortError")),
};
const ROTA_TOKEN_OK: Route = {
  match: "api.elevenlabs.io",
  make: () => jsonResp({ token: "tok-de-teste" }),
};

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ELEVENLABS_API_KEY"] as const;
const ENV_OK = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-de-teste",
  ELEVENLABS_API_KEY: "xi-key-de-teste",
};

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => Promise<void>) {
  const saved = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

function tokenRequest(): Request {
  return new Request("https://stub.supabase.co/functions/v1/elevenlabs-scribe-token", {
    method: "POST",
    headers: { Authorization: "Bearer token-de-teste" },
  });
}

Deno.test("prazo estourado no provedor: 504 claro, signal de prazo e ledger em erro", async () => {
  const { calls, restore } = withFetch([ROTA_AUTH, ROTA_RATE_LIMIT, ROTA_LEDGER, ROTA_TIMEOUT]);
  try {
    await withEnv(ENV_OK, async () => {
      const res = await handleElevenLabsScribeToken(tokenRequest());
      assert(res.status === 504, `esperava 504, veio ${res.status}`);
      const corpo = await res.json();
      assert(corpo?.error?.code === "AI_TIMEOUT", "o corpo do 504 precisa do código AI_TIMEOUT");
      const texto = JSON.stringify(corpo).toLowerCase();
      assert(!texto.includes("abort") && !texto.includes("domexception"), "a resposta não pode vazar o detalhe interno");

      const provedor = calls.find((c) => c.url.includes("api.elevenlabs.io"));
      assert(provedor, "o provedor precisa ter sido chamado");
      assert(provedor!.init?.signal instanceof AbortSignal, "a chamada ao provedor precisa do prazo (AbortSignal)");

      const ledger = calls.find((c) => c.url.includes("/rest/v1/ai_usage_logs") && c.init?.method === "POST");
      assert(ledger, "o ledger de custo precisa registrar a tentativa mesmo em timeout");
      const linha = JSON.parse(String(ledger!.init!.body));
      assert(linha.status === "error", `linha do ledger devia ser status=error, veio ${linha.status}`);
      assert(String(linha.error_message).toLowerCase().includes("timeout"), "a linha do ledger precisa dizer que foi timeout");
      assert(linha.metadata?.http_status === null, "sem resposta do provedor, http_status é null");
    });
  } finally {
    restore();
  }
});

Deno.test("provedor responde: 200 com o token e ledger em sucesso", async () => {
  const { calls, restore } = withFetch([ROTA_AUTH, ROTA_RATE_LIMIT, ROTA_LEDGER, ROTA_TOKEN_OK]);
  try {
    await withEnv(ENV_OK, async () => {
      const res = await handleElevenLabsScribeToken(tokenRequest());
      assert(res.status === 200, `esperava 200, veio ${res.status}`);
      const corpo = await res.json();
      assert(corpo?.token === "tok-de-teste", "o token do provedor precisa ser repassado");

      const ledger = calls.find((c) => c.url.includes("/rest/v1/ai_usage_logs") && c.init?.method === "POST");
      assert(ledger, "o ledger precisa registrar o consumo");
      const linha = JSON.parse(String(ledger!.init!.body));
      assert(linha.status === "success", `linha do ledger devia ser status=success, veio ${linha.status}`);
      assert(linha.error_message === null, "sucesso não carrega error_message");
      assert(linha.metadata?.http_status === 200, "o http_status do sucesso precisa ficar no ledger");
    });
  } finally {
    restore();
  }
});
