// IA-009 / SL-010b — kill switch da família de voz/áudio da ElevenLabs.
//
// O voice-changer (speech-to-speech) é uma chamada PAGA ao provedor. A decisão
// SL-010b (cartão de decisão t_98090b40) define UMA chave por família:
// `ai.capability.voice`. Este teste prova o caso NEGADO: com a capacidade
// DESLIGADA no servidor, o handler responde 503 `AI_DISABLED` (contrato único
// da família, via `jsonResponse`) e NÃO toca o provedor. O gate fica DEPOIS do
// rate limit (posição uniforme da família: auth → limite → gate → provedor),
// então o limite é reservado antes da recusa.
// Antes da correção o handler ignorava a flag: chamava a ElevenLabs e devolvia
// o áudio mesmo com a capacidade desligada.
//
// O handler REAL roda com o `fetch` global stubado por trecho de URL.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/voice-changer/index.test.ts

import { handleVoiceChanger } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "20000000-0000-0000-0000-00000000000c";

type Route = { match: string; body: unknown; status?: number };

function withFetch(routes: Route[]) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string }> = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    calls.push({ url });
    // R2-AUTH-022: `requireAuth` consulta a política de rede antes de liberar.
    if (url.includes("/rest/v1/rpc/resolve_network_policy")) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return Promise.resolve(new Response("nao stubado", { status: 599 }));
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  const seen = () => calls.map((c) => c.url);
  return { calls, seen, restore: () => { globalThis.fetch = original; } };
}

/** Chaves de ambiente que o handler exige (restauradas ao final de cada teste). */
const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ELEVENLABS_API_KEY"] as const;
/** Valores válidos de ambiente (nunca fixados no topo: sem contaminar a rodada). */
const ENV_OK: Record<string, string> = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-de-teste",
  ELEVENLABS_API_KEY: "xi-api-key-de-teste",
};

/** Roda `fn` com o env ajustado e restaura tudo ao final (nunca vaza para a rodada). */
async function withEnv(env: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const anteriores = new Map<string, string | undefined>();
  for (const chave of ENV_KEYS) {
    anteriores.set(chave, Deno.env.get(chave));
    const valor = env[chave];
    if (valor === undefined) Deno.env.delete(chave);
    else Deno.env.set(chave, valor);
  }
  try {
    await fn();
  } finally {
    for (const chave of ENV_KEYS) {
      const anterior = anteriores.get(chave);
      if (anterior === undefined) Deno.env.delete(chave);
      else Deno.env.set(chave, anterior);
    }
  }
}

const ROTA_AUTH: Route = { match: "/auth/v1/user", body: { id: USER_ID, aud: "authenticated" } };
const ROTA_RATE_LIMIT: Route = {
  match: "/rest/v1/rpc/consume_rate_limit",
  body: [{ allowed: true, remaining: 9 }],
};

function flagsRoute(enabled: boolean): Route {
  return { match: "/rest/v1/feature_flags", body: { enabled } };
}

/** Requisição do voice-changer: multipart com o arquivo de áudio. */
function makeRequest(withAuth = true): Request {
  const headers: Record<string, string> = {};
  if (withAuth) headers.Authorization = "Bearer token-de-teste";
  const fd = new FormData();
  fd.append("audio", new File([new Uint8Array([1, 2, 3, 4])], "voz.mp3", { type: "audio/mpeg" }));
  fd.append("voice_preset", "grave");
  return new Request("https://stub.supabase.co/functions/v1/voice-changer", {
    method: "POST",
    headers,
    body: fd,
  });
}

Deno.test("IA-009/SL-010b: capacidade de voz desligada -> 503 AI_DISABLED, sem provedor (gate depois do limite)", () =>
  withEnv(ENV_OK, async () => {
  const stub = withFetch([
    ROTA_AUTH,
    flagsRoute(false),
    ROTA_RATE_LIMIT,
    { match: "api.elevenlabs.io", body: {} },
  ]);
  try {
    const res = await handleVoiceChanger(makeRequest());

    assert(res.status === 503, `capacidade desligada deveria recusar com 503, veio ${res.status}`);
    const payload = await res.json() as { error?: { code?: string; message?: string } };
    assert(
      payload.error?.code === "AI_DISABLED",
      `código inesperado no corpo: ${JSON.stringify(payload)}`,
    );
    assert(
      !stub.seen().some((u) => u.includes("api.elevenlabs.io")),
      `capacidade desligada NÃO pode tocar o provedor: ${stub.seen().join(", ")}`,
    );
    // Posição uniforme da família (auth → limite → gate → provedor): o limite é
    // reservado antes da recusa, igual às outras 6 funções.
    const limites = stub.seen().filter((u) => u.includes("/rest/v1/rpc/consume_rate_limit"));
    assert(limites.length === 1, `o limite deveria ser reservado antes do gate, veio ${limites.length}`);
    const flags = stub.seen().filter((u) => u.includes("/rest/v1/feature_flags"));
    assert(flags.length === 1, `esperado 1 leitura da flag, veio ${flags.length}`);
    assert(
      flags[0].includes("ai.capability.voice"),
      `a chave de capacidade inesperada: ${flags[0]}`,
    );
  } finally {
    stub.restore();
  }
  }));

Deno.test("IA-009/SL-010b: capacidade de voz LIGADA -> caminho feliz alcança o provedor (o gate não é bloqueio geral)", () =>
  withEnv(ENV_OK, async () => {
  const stub = withFetch([
    ROTA_AUTH,
    flagsRoute(true),
    ROTA_RATE_LIMIT,
    {
      match: "api.elevenlabs.io",
      body: { ok: true },
    },
  ]);
  // O provedor devolve áudio binário; troca a resposta stubada por bytes.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.includes("api.elevenlabs.io")) {
      stub.calls.push({ url });
      return Promise.resolve(new Response(new Uint8Array([7, 7, 7]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }));
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof fetch;
  try {
    const res = await handleVoiceChanger(makeRequest());
    assert(res.status === 200, `capacidade ligada deveria processar (200), veio ${res.status}`);
    assert(
      stub.seen().some((u) => u.includes("api.elevenlabs.io/v1/speech-to-speech/")),
      `capacidade ligada deveria alcançar o provedor: ${stub.seen().join(", ")}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
    stub.restore();
  }
  }));

Deno.test("IA-009/SL-010b: sem bearer -> 401 e nada de rede", () =>
  withEnv(ENV_OK, async () => {
  const stub = withFetch([ROTA_AUTH, flagsRoute(true)]);
  try {
    const res = await handleVoiceChanger(makeRequest(false));
    assert(res.status === 401, `esperado 401, veio ${res.status}`);
    assert(stub.seen().length === 0, `não deveria tocar a rede: ${stub.seen().join(", ")}`);
  } finally {
    stub.restore();
  }
  }));
