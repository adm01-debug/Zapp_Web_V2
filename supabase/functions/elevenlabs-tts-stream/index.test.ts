// LAC P2 + LGPD (doc 07, achado de voz): a `elevenlabs-tts-stream` chamava o
// provedor PAGO sem prazo e, em erro, deixava o consumo fora do ledger; a rede
// travada pendurava a request segurando o limite de taxa do usuário.
//
// Aceite:
//   - prazo estourado -> 504 CLARO (código AI_TIMEOUT), sem vazar detalhe interno;
//   - a chamada ao provedor leva `AbortSignal` (o prazo);
//   - erro de rede (não-prazo) -> 502 com código próprio;
//   - o ledger registra a tentativa MESMO em erro (status error; `billing_quantity`
//     null quando o provedor nem respondeu — não se inventa unidade de cobrança);
//   - o log da fala carrega SÓ o tamanho do texto, NUNCA o texto (LGPD).
//
// A prova roda o handler REAL com o `fetch` global stubado e captura o `console`.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/elevenlabs-tts-stream/index.test.ts

import { handleElevenLabsTtsStream } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "20000000-0000-0000-0000-00000000000f";
// Texto com dado pessoal sintético: a prova de LGPD é NÃO ver isso no log.
const TEXTO = "Ola, meu cpf e 111.222.333-44, pode confirmar o endereco?";

type Route = { match: string; make: () => Response | Promise<Response> };
type Call = { url: string; init?: RequestInit };

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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

function capturarConsole() {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const linhas: string[] = [];
  const push = (...args: unknown[]) => {
    linhas.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.log = push;
  console.warn = push;
  console.error = push;
  return {
    linhas,
    restaurar: () => {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    },
  };
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
const ROTA_TIMEOUT: Route = {
  match: "api.elevenlabs.io",
  make: () => Promise.reject(new DOMException("The operation was aborted.", "AbortError")),
};
const ROTA_REDE: Route = {
  match: "api.elevenlabs.io",
  make: () => Promise.reject(new TypeError("network down")),
};
const ROTA_AUDIO_OK: Route = {
  match: "api.elevenlabs.io",
  make: () =>
    new Response("audio-fake", { status: 200, headers: { "content-type": "audio/mpeg" } }),
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

function ttsRequest(): Request {
  return new Request("https://stub.supabase.co/functions/v1/elevenlabs-tts-stream", {
    method: "POST",
    headers: { Authorization: "Bearer token-de-teste", "content-type": "application/json" },
    body: JSON.stringify({ text: TEXTO }),
  });
}

Deno.test("prazo estourado: 504 claro, signal de prazo, ledger em erro e log sem o texto", async () => {
  const { calls, restore } = withFetch([ROTA_AUTH, ROTA_RATE_LIMIT, ROTA_LEDGER, ROTA_TIMEOUT]);
  const captura = capturarConsole();
  try {
    await withEnv(ENV_OK, async () => {
      const res = await handleElevenLabsTtsStream(ttsRequest());
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
      assert(String(linha.error_message).toLowerCase().includes("timeout"), "o ledger precisa dizer que foi timeout");
      assert(linha.metadata?.http_status === null, "sem resposta do provedor, http_status é null");
      assert(linha.metadata?.billing_quantity === null, "sem resposta do provedor, não se inventa unidade de cobrança");

      const saida = captura.linhas.join("\n");
      assert(saida.includes("Streaming TTS:"), "o handler precisa registrar o início da síntese");
      assert(!saida.includes(TEXTO), "o texto da fala NUNCA pode aparecer no log");
      assert(!saida.includes("111.222.333-44"), "dado pessoal do texto não pode aparecer no log");
    });
  } finally {
    captura.restaurar();
    restore();
  }
});

Deno.test("erro de rede (não-prazo): 502 com código próprio e ledger em erro", async () => {
  const { calls, restore } = withFetch([ROTA_AUTH, ROTA_RATE_LIMIT, ROTA_LEDGER, ROTA_REDE]);
  try {
    await withEnv(ENV_OK, async () => {
      const res = await handleElevenLabsTtsStream(ttsRequest());
      assert(res.status === 502, `esperava 502, veio ${res.status}`);
      const corpo = await res.json();
      assert(corpo?.error?.code === "AI_PROVIDER_UNREACHABLE", "o 502 precisa do código AI_PROVIDER_UNREACHABLE");

      const ledger = calls.find((c) => c.url.includes("/rest/v1/ai_usage_logs") && c.init?.method === "POST");
      assert(ledger, "o ledger precisa registrar a tentativa que falhou por rede");
      const linha = JSON.parse(String(ledger!.init!.body));
      assert(linha.status === "error", "erro de rede entra como status=error no ledger");
    });
  } finally {
    restore();
  }
});

Deno.test("provedor responde audio: 200 e ledger em sucesso com a unidade de cobrança", async () => {
  const { calls, restore } = withFetch([ROTA_AUTH, ROTA_RATE_LIMIT, ROTA_LEDGER, ROTA_AUDIO_OK]);
  const captura = capturarConsole();
  try {
    await withEnv(ENV_OK, async () => {
      const res = await handleElevenLabsTtsStream(ttsRequest());
      assert(res.status === 200, `esperava 200, veio ${res.status}`);
      assert((await res.text()) === "audio-fake", "o audio do provedor precisa ser repassado");

      const ledger = calls.find((c) => c.url.includes("/rest/v1/ai_usage_logs") && c.init?.method === "POST");
      assert(ledger, "o ledger precisa registrar o consumo");
      const linha = JSON.parse(String(ledger!.init!.body));
      assert(linha.status === "success", `linha do ledger devia ser status=success, veio ${linha.status}`);
      assert(linha.metadata?.http_status === 200, "o http_status do sucesso precisa ficar no ledger");
      assert(linha.metadata?.billing_quantity === TEXTO.length, "a unidade de cobrança do sucesso é o tamanho do texto");

      assert(!captura.linhas.join("\n").includes(TEXTO), "o texto da fala NUNCA pode aparecer no log");
    });
  } finally {
    captura.restaurar();
    restore();
  }
});
