// IA-009 / SL-010b (decisão do cartão t_98090b40; entrega t_1266b773) — o kill
// switch de voz é lido no SERVIDOR, depois da cota e ANTES de tocar a ElevenLabs.
//
// Defeito: `elevenlabs-tts` chamava o provedor pago sem conferir a capacidade de
// voz. Desligar a flag no cliente escondia o botão, mas quem chamasse a Edge
// direto (ou um bundle velho) continuava gerando áudio pago. A chave é a do
// desenho IA-009 usada por toda a família de voz: `ai.capability.voice`.
//
// A prova roda o handler REAL com o `fetch` global dublado por trecho de URL:
//  - `/auth/v1/user` e `/rest/v1/rpc/*` — autenticação e cota;
//  - `/rest/v1/feature_flags` — a leitura da flag (a chave pedida é conferida);
//  - `api.elevenlabs.io` — o provedor pago, que o caso desligado NÃO pode alcançar.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/elevenlabs-tts/index.test.ts

import { handleElevenLabsTts } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "20000000-0000-0000-0000-000000000001";
const PROVIDER = "api.elevenlabs.io";
const VOICE_FLAG_KEY = "ai.capability.voice";

type Route = { match: string; make: () => Response };
type Call = { url: string; init?: RequestInit };

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Dubla o `fetch` global e devolve todas as chamadas (URL + init) capturadas. */
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
  make: () => jsonResp([{ allowed: true, remaining: 19 }]),
};
const ROTA_NETWORK_POLICY: Route = {
  match: "/rest/v1/rpc/resolve_network_policy",
  make: () =>
    jsonResp([{ allowed: true, reason: null, rate_limit_max_requests: 20, rate_limit_window_seconds: 60 }]),
};
const ROTA_TTS: Route = {
  match: PROVIDER,
  make: () =>
    new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    }),
};
/** A flag de voz LIGADA (padrão do caminho feliz). */
const ROTA_FLAG_ON: Route = {
  match: "/rest/v1/feature_flags",
  make: () => jsonResp({ enabled: true }),
};
/** A flag de voz DESLIGADA pelo operador. */
const ROTA_FLAG_OFF: Route = {
  match: "/rest/v1/feature_flags",
  make: () => jsonResp({ enabled: false }),
};

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

function ttsRequest(body: Record<string, unknown> = { text: "bom dia" }): Request {
  return new Request("https://stub.supabase.co/functions/v1/elevenlabs-tts", {
    method: "POST",
    headers: { Authorization: "Bearer token-de-teste", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function callsTo(calls: Call[], match: string): Call[] {
  return calls.filter((c) => c.url.includes(match));
}

Deno.test("IA-009: flag de voz desligada -> 503 AI_DISABLED e ZERO chamada ao provedor pago", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_NETWORK_POLICY, ROTA_RATE_LIMIT, ROTA_TTS, ROTA_FLAG_OFF]);
    try {
      const res = await handleElevenLabsTts(ttsRequest());

      assert(res.status === 503, `esperado 503, veio ${res.status}`);
      const body = await res.json() as { error?: { code?: string; message?: string } };
      assert(body.error?.code === "AI_DISABLED", `codigo esperado AI_DISABLED, veio ${body.error?.code}`);

      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "flag de voz desligada não pode gerar POST a api.elevenlabs.io",
      );
      const consulta = callsTo(stub.calls, "/rest/v1/feature_flags");
      assert(consulta.length === 1, `esperada 1 leitura de feature_flags, houve ${consulta.length}`);
      assert(
        consulta[0].url.includes(encodeURIComponent(VOICE_FLAG_KEY)) || consulta[0].url.includes(VOICE_FLAG_KEY),
        `a leitura deve pedir a chave ${VOICE_FLAG_KEY}: ${consulta[0].url}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-009: flag de voz ligada -> 200 e o provedor é chamado (o gate não barra o caminho feliz)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([ROTA_AUTH, ROTA_NETWORK_POLICY, ROTA_RATE_LIMIT, ROTA_TTS, ROTA_FLAG_ON]);
    try {
      const res = await handleElevenLabsTts(ttsRequest());

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      assert(callsTo(stub.calls, PROVIDER).length === 1, "com a flag ligada o provedor tem de ser chamado");
    } finally {
      stub.restore();
    }
  });
});
