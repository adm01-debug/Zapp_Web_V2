// G5 (achado 20/21 da auditoria de IA e voz) — `elevenlabs-tts` era a única Edge
// de voz sem teste e sem prazo na chamada PAGA ao provedor:
//   - `fetch` pendurado prendia o handler para sempre (nenhum teto de tempo);
//   - um estouro virava 500 genérico (não distinguia "o provedor não respondeu");
//   - o 500 devolvia o `error.message` interno.
// Aceite: prazo de produção declarado, estouro -> 504 claro, 500 sem detalhe
// interno e teste do contrato (auth, lista fechada, tamanho, cota, ledger).
//
// Armadilha do revisor (comentário do cartão): o prazo vale só até os CABEÇALHOS
// chegarem. `AbortSignal.timeout` continuaria armado durante a leitura do CORPO e
// cortaria sínteses longas no meio. Por isso o teste "corpo lento" prova que um
// áudio que demora MAIS que o prazo, mas cujos cabeçalhos chegaram a tempo, sai
// inteiro (200).
//
// A prova roda o handler REAL com o `fetch` global stubado por trecho de URL:
// `/auth/v1/user` (requireAuth), `/rest/v1/rpc/consume_rate_limit`
// (enforceRateLimit) e `api.elevenlabs.io` — este último é o alvo.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/elevenlabs-tts/index.test.ts

import { handleElevenLabsTts, TTS_TIMEOUT_MS } from "./index.ts";
import { ELEVENLABS_VOICE_IDS } from "../_shared/schemas.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "20000000-0000-0000-0000-00000000000d";
const VOZ_FORA_DA_LISTA = "voz-clonada-fora-da-lista";
const VOICE_FLAG_KEY = "ai.capability.voice";

type Route = { match: string; make: (init?: RequestInit) => Response | Promise<Response> };
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
    return Promise.resolve(route.make(init));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/** Rota do provedor pago — o que o handler NÃO pode alcançar nos casos recusados. */
const PROVIDER = "api.elevenlabs.io";

const ROTA_AUTH: Route = {
  match: "/auth/v1/user",
  make: () => jsonResp({ id: USER_ID, aud: "authenticated" }),
};
const ROTA_RATE_LIMIT: Route = {
  match: "/rest/v1/rpc/consume_rate_limit",
  make: () => jsonResp([{ allowed: true, remaining: 9 }]),
};
const ROTA_AUDIO: Route = {
  match: PROVIDER,
  make: () =>
    new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    }),
};
const ROTA_FLAG_ON: Route = {
  match: "/rest/v1/feature_flags",
  make: () =>
    Response.json([{ key: VOICE_FLAG_KEY, enabled: true }], {
      headers: { "content-range": "0-0/1" },
    }),
};
const ROTA_FLAG_OFF: Route = {
  match: "/rest/v1/feature_flags",
  make: () =>
    Response.json([{ key: VOICE_FLAG_KEY, enabled: false }], {
      headers: { "content-range": "0-0/1" },
    }),
};
const ROTAS_OK = [ROTA_AUTH, ROTA_RATE_LIMIT, ROTA_AUDIO, ROTA_FLAG_ON];

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ELEVENLABS_API_KEY",
] as const;

const ENV_OK = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-de-teste",
  ELEVENLABS_API_KEY: "xi-key-de-teste",
};

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  fn: () => Promise<void>,
) {
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

function ttsRequest(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (withAuth) headers.Authorization = "Bearer token-de-teste";
  return new Request("https://stub.supabase.co/functions/v1/elevenlabs-tts", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function callsTo(calls: Call[], match: string): Call[] {
  return calls.filter((c) => c.url.includes(match));
}

/** Linhas do ledger de consumo (`ai_usage_logs`) realmente enviadas ao PostgREST. */
function ledgerRows(calls: Call[]): Array<Record<string, unknown>> {
  return calls
    .filter((c) => c.url.includes("/rest/v1/ai_usage_logs") && (c.init?.method ?? "GET") === "POST")
    .map((c) => JSON.parse(String(c.init?.body)) as Record<string, unknown>);
}

/**
 * Corpo de áudio que chega em DOIS pedaços separados por atrasos.
 *
 * O `fetch` real amarra o CORPO ao `signal`: abortar rejeita a leitura do corpo.
 * A emulação reproduz isso (`controller.error(signal.reason)`), senão o teste do
 * prazo não provaria nada — o `Response` sintético não enxergaria o abort.
 */
function slowAudioBody(totalMs: number, signal?: AbortSignal | null): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      if (signal) {
        signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      }
      const meio = Math.floor(totalMs / 2);
      await new Promise((r) => setTimeout(r, meio));
      controller.enqueue(new Uint8Array([7, 8]));
      await new Promise((r) => setTimeout(r, meio));
      controller.enqueue(new Uint8Array([9, 10]));
      controller.close();
    },
  });
}

Deno.test("G5: prazo de produção declarado é o teto acordado (30 s)", () => {
  assert(TTS_TIMEOUT_MS === 30_000, `prazo de produção esperado 30 s, é ${TTS_TIMEOUT_MS}`);
});

Deno.test("G5: provedor pendurado estoura o prazo -> 504 e linha no ledger", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT,
      ROTA_FLAG_ON,
      // O provedor NUNCA resolve: prova o teto de tempo (o wrapper de abort
      // rejeita de fora mesmo que a implementação ignore o `signal`).
      { match: PROVIDER, make: () => new Promise<Response>(() => {}) },
    ]);
    try {
      const res = await handleElevenLabsTts(
        ttsRequest({ text: "texto curto", voiceId: ELEVENLABS_VOICE_IDS[0] }),
        { ttsTimeoutMs: 25 },
      );

      assert(res.status === 504, `esperado 504 no estouro de prazo, veio ${res.status}`);
      const corpo504 = await res.text();
      assert(
        !corpo504.includes("xi-key-de-teste"),
        "corpo do 504 não pode vazar a chave do provedor",
      );
      assert(
        !corpo504.includes("api.elevenlabs.io"),
        "corpo do 504 não pode vazar detalhe do provedor",
      );
      const row = ledgerRows(stub.calls).find((r) => r.function_name === "elevenlabs-tts");
      assert(row !== undefined, "a tentativa abortada tem de deixar linha no ledger");
      assert(row.status === "error", `status esperado error, veio ${String(row.status)}`);
      assert(
        row.error_message === "provider_timeout",
        `error_message esperado provider_timeout, veio ${String(row.error_message)}`,
      );
      const meta = row.metadata as Record<string, unknown>;
      assert(meta.http_status === null, "tentativa sem resposta tem http_status nulo");
      assert(meta.billing_unit === "character", "unidade cobrada é caractere");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G5: cabeçalhos a tempo + corpo LENTO (> prazo) -> áudio completo (o prazo só cobre os cabeçalhos)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT,
      ROTA_FLAG_ON,
      {
        match: PROVIDER,
        make: (init) =>
          new Response(slowAudioBody(60, init?.signal), {
            status: 200,
            headers: { "content-type": "audio/mpeg" },
          }),
      },
    ]);
    try {
      const inicio = Date.now();
      const res = await handleElevenLabsTts(
        ttsRequest({ text: "sintese longa", voiceId: ELEVENLABS_VOICE_IDS[0] }),
        { ttsTimeoutMs: 25 },
      );
      const decorrido = Date.now() - inicio;

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      assert(
        decorrido >= 50,
        `o corpo tinha de levar mais que o prazo (25 ms) sem cortar; levou ${decorrido} ms`,
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert(bytes.byteLength === 4, `áudio completo esperado (4 bytes), veio ${bytes.byteLength}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G5: sem bearer -> 401 e não toca o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleElevenLabsTts(ttsRequest({ text: "oi" }, false));
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(callsTo(stub.calls, PROVIDER).length === 0, "sem autenticação não se chama o provedor");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G5: voz fora da lista fechada -> 422 antes do POST ao provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleElevenLabsTts(ttsRequest({ text: "oi", voiceId: VOZ_FORA_DA_LISTA }));
      // 422 é o status de `validationErrorResponse` (schema zod) usado por toda
      // Edge do repo — não é o 400 do caminho `resolveElevenLabsStsInputs`.
      assert(res.status === 422, `esperado 422, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "voz recusada pela lista fechada não pode tocar o provedor",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G5: texto acima de 5000 caracteres -> 422 antes do POST ao provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleElevenLabsTts(ttsRequest({ text: "a".repeat(5001) }));
      assert(res.status === 422, `esperado 422, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "texto recusado pelo schema não pode tocar o provedor",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G5: cota negada -> 429 antes do POST ao provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      { match: "/rest/v1/rpc/consume_rate_limit", make: () => jsonResp([{ allowed: false }]) },
      ROTA_AUDIO,
    ]);
    try {
      const res = await handleElevenLabsTts(ttsRequest({ text: "oi" }));
      assert(res.status === 429, `esperado 429, veio ${res.status}`);
      assert(callsTo(stub.calls, PROVIDER).length === 0, "cota negada não pode tocar o provedor");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G5: caminho feliz -> 200, 1 POST e linha no ledger com a contagem de caracteres", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const texto = "Ola, mundo!";
      const res = await handleElevenLabsTts(
        ttsRequest({ text: texto, voiceId: ELEVENLABS_VOICE_IDS[0] }),
      );

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const externas = callsTo(stub.calls, PROVIDER);
      assert(externas.length === 1, `esperado 1 POST ao provedor, veio ${externas.length}`);
      assert(
        externas[0].url.includes(`/v1/text-to-speech/${ELEVENLABS_VOICE_IDS[0]}`),
        `endpoint inesperado: ${externas[0].url}`,
      );
      assert(
        res.headers.get("content-type") === "audio/mpeg",
        `content-type inesperado: ${res.headers.get("content-type")}`,
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert(bytes.byteLength === 4, `áudio esperado com 4 bytes, veio ${bytes.byteLength}`);

      const row = ledgerRows(stub.calls).find((r) => r.function_name === "elevenlabs-tts");
      assert(row !== undefined, "chamada paga tem de deixar linha no ledger");
      assert(row.user_id === USER_ID, `user_id esperado ${USER_ID}, veio ${String(row.user_id)}`);
      assert(row.status === "success", `status esperado success, veio ${String(row.status)}`);
      const meta = row.metadata as Record<string, unknown>;
      assert(meta.billing_unit === "character", "unidade cobrada é caractere");
      assert(
        meta.billing_quantity === texto.length,
        `quantidade cobrada esperada ${texto.length}, veio ${String(meta.billing_quantity)}`,
      );
      assert(meta.http_status === 200, `http_status esperado 200, veio ${String(meta.http_status)}`);
      assert(row.input_tokens === null, "colunas de token ficam NULL (não medi, não é zero)");
      assert(row.output_tokens === null, "colunas de token ficam NULL (não medi, não é zero)");
      assert(
        (row.metadata as Record<string, unknown>).usage_unknown === true,
        "a linha declara o consumo como desconhecido",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-009/SL-010b: voz desligada na flag nega sem tocar o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_RATE_LIMIT, ROTA_FLAG_OFF, ROTA_AUDIO]);
    try {
      const res = await handleElevenLabsTts(ttsRequest({ text: "oi" }));
      assert(res.status === 503, `esperado 503, veio ${res.status}`);
      const body = await res.json() as { error?: { code?: string } };
      assert(body.error?.code === "AI_DISABLED", `code esperado AI_DISABLED, veio ${String((body.error as { code?: string } | undefined)?.code)}`);
      assert(callsTo(stub.calls, PROVIDER).length === 0, "flag desligada não pode tocar o provedor pago");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-009/SL-010b: voz ligada na flag chama o provedor pago", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleElevenLabsTts(ttsRequest({ text: "oi" }));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      assert(callsTo(stub.calls, PROVIDER).length === 1, "flag ligada tem de chamar o provedor pago");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("TTS: 500 do provedor vira 500 genérico sem vazar detalhe interno", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT,
      ROTA_FLAG_ON,
      {
        match: PROVIDER,
        make: () =>
          new Response("quota exceeded for voice XYZ", {
            status: 500,
            headers: { "content-type": "text/plain" },
          }),
      },
    ]);
    try {
      const res = await handleElevenLabsTts(ttsRequest({ text: "oi" }));
      // Comportamento real da implementação: o 500 do provedor cai no catch e
      // sai como 500 genérico (`internalErrorResponse`) — o detalhe interno
      // ("quota exceeded...", nome da voz) não pode vazar no corpo.
      assert(res.status === 500, `esperado 500 genérico, veio ${res.status}`);
      const text = await res.text();
      assert(!text.includes("quota exceeded"), "detalhe interno do 500 não pode vazar");
      assert(!text.includes("XYZ"), "detalhe interno do 500 não pode vazar");
      assert(!text.includes("ElevenLabs API error"), "mensagem interna não pode vazar");
      assert(text.includes("Internal server error"), `corpo genérico esperado, veio ${text}`);
      const row500 = ledgerRows(stub.calls).find((r) => r.function_name === "elevenlabs-tts");
      assert(row500 !== undefined, "500 do provedor tem de deixar linha de erro no ledger");
      assert(row500.status === "error", `status esperado error, veio ${String(row500.status)}`);
      assert(
        row500.error_message === "ElevenLabs HTTP 500",
        `error_message esperado ElevenLabs HTTP 500, veio ${String(row500.error_message)}`,
      );
      const meta500 = row500.metadata as Record<string, unknown>;
      assert(meta500.http_status === 500, `http_status esperado 500, veio ${String(meta500.http_status)}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("TTS: fetch rejeitando com erro interno vira 500 genérico + ledger error com http_status null", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT,
      ROTA_FLAG_ON,
      {
        match: PROVIDER,
        make: () => Promise.reject(new Error("segredo-interno-xyz")),
      },
    ]);
    try {
      const res = await handleElevenLabsTts(ttsRequest({ text: "oi" }));
      assert(res.status === 500, `esperado 500 genérico, veio ${res.status}`);
      const text = await res.text();
      assert(!text.includes("segredo-interno-xyz"), "erro interno do fetch não pode vazar");
      assert(text.includes("Internal server error"), `corpo genérico esperado, veio ${text}`);
      const row = ledgerRows(stub.calls).find((r) => r.function_name === "elevenlabs-tts");
      assert(row !== undefined, "falha do fetch tem de deixar linha de erro no ledger");
      assert(row.status === "error", `status esperado error, veio ${String(row.status)}`);
      const meta = row.metadata as Record<string, unknown>;
      assert(meta.http_status === null, "falha sem resposta tem http_status nulo");
    } finally {
      stub.restore();
    }
  });
});
