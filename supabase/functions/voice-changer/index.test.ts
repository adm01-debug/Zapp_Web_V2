// G3 (achado 24 a 27 do mapa de paridade) — a Edge `voice-changer` tinha um
// chamador real na V2 (`VoiceChangerPicker.tsx`), então NÃO se remove: ela é
// ENDURECIDA no nível da Edge irmã `elevenlabs-sts`.
//
// Antes: `voice-changer/index.ts` fazia `req.formData()` ANTES de qualquer recusa
// (o corpo inteiro ia para a memória), só conferia `File.size` depois de ler tudo,
// NÃO conferia o conteúdo (um blob que só DIZIA ser áudio chegava ao provedor pago)
// e não registrava consumo (`PENDENTES_DECLARADAS` em
// `_shared/__tests__/consumo-pago-no-ledger.test.ts`), com timeout de 30 s.
//
// Este teste roda o handler REAL com o `fetch` global stubado por trecho de URL:
// `/auth/v1/user` e `/rest/v1/rpc/resolve_network_policy` (requireAuth),
// `/rest/v1/rpc/consume_rate_limit` (enforceRateLimit), `/rest/v1/ai_usage_logs`
// (ledger) e `api.elevenlabs.io` — este último é o alvo: os casos de recusa exigem
// ZERO chamada a ele.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/voice-changer/index.test.ts

import { handleVoiceChanger } from "./index.ts";
import { MAX_VOICE_CHANGER_AUDIO_BYTES } from "../_shared/sts-upload.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "20000000-0000-0000-0000-00000000000c";

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
    // R2-AUTH-022: `requireAuth` consulta a política de rede (RPC service_role)
    // antes de liberar o handler. O stub responde "allow" para o caminho feliz.
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

/** Rota do provedor pago — o que o handler NÃO pode alcançar nos casos abusivos. */
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
// SL-013 / IA-003 B6 — o ledger de consumo. O PostgREST do supabase-js passa
// pelo mesmo `fetch` stubado (a função cria o cliente com a service role).
const ROTA_LEDGER: Route = {
  match: "/rest/v1/ai_usage_logs",
  make: () => jsonResp(null, 201),
};
const ROTAS_OK = [ROTA_AUTH, ROTA_RATE_LIMIT, ROTA_AUDIO, ROTA_LEDGER];

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

/** Cabeçalho OggS + recheio: container reconhecido, sem depender de um áudio real. */
function oggBytes(size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  bytes.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  return bytes;
}

function voiceRequest(
  form: FormData,
  withAuth = true,
  extraHeaders: Record<string, string> = {},
): Request {
  const headers: Record<string, string> = { ...extraHeaders };
  if (withAuth) headers.Authorization = "Bearer token-de-teste";
  return new Request("https://stub.supabase.co/functions/v1/voice-changer", {
    method: "POST",
    headers,
    body: form,
  });
}

function formFor(file: File, preset = "grave"): FormData {
  const form = new FormData();
  form.append("audio", file, "audio.ogg");
  form.append("voice_preset", preset);
  return form;
}

function callsTo(calls: Call[], match: string): Call[] {
  return calls.filter((c) => c.url.includes(match));
}

/**
 * `File` real acima do teto (head OggS + recheio): prova que o caminho do `size`
 * recusa antes do provedor. O `FormData` só aceita `Blob`/`File` de verdade, então
 * não dá para falsificar o `size` como nas provas de unidade do validador.
 */
function bigOgg(size: number): File {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  bytes.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  return new File([bytes], "audio.ogg", { type: "audio/ogg" });
}

/** A linha que o PostgREST recebeu (o supabase-js manda objeto ou [objeto]). */
function linhaDoLedger(calls: Call[]): Record<string, unknown> | null {
  const post = callsTo(calls, "/rest/v1/ai_usage_logs").find((c) => c.init?.method === "POST");
  if (!post || post.init?.body === undefined || post.init?.body === null) return null;
  const corpo = JSON.parse(String(post.init.body)) as
    | Record<string, unknown>
    | Record<string, unknown>[];
  return (Array.isArray(corpo) ? corpo[0] : corpo) ?? null;
}

Deno.test("G3: sem bearer -> 401 e não toca o provedor pago", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleVoiceChanger(
        voiceRequest(formFor(new File([oggBytes()], "audio.ogg", { type: "audio/ogg" })), false),
      );
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(callsTo(stub.calls, PROVIDER).length === 0, "sem autenticação não se chama o provedor");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: content-length acima do teto -> 413 ANTES de ler o corpo e sem POST", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      // `new Request(url, { body: FormData })` NÃO gera `content-length`, então o
      // teste o envia explicitamente: corpo pequeno e válido + cabeçalho anunciando
      // acima do teto. O 413 prova a fronteira do cabeçalho.
      const res = await handleVoiceChanger(
        voiceRequest(
          formFor(new File([oggBytes()], "audio.ogg", { type: "audio/ogg" })),
          true,
          { "content-length": String(MAX_VOICE_CHANGER_AUDIO_BYTES + 1) },
        ),
      );

      assert(res.status === 413, `esperado 413, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "corpo acima do teto não pode chegar ao provedor pago",
      );
      const body = await res.json() as { error?: string };
      assert(
        typeof body.error === "string" && body.error.includes(String(MAX_VOICE_CHANGER_AUDIO_BYTES)),
        `esperado erro citando o teto, veio: ${JSON.stringify(body)}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: upload maior que o teto no size real -> 413 (e não toca o provedor)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleVoiceChanger(
        voiceRequest(formFor(bigOgg(MAX_VOICE_CHANGER_AUDIO_BYTES + 1))),
      );
      assert(res.status === 413, `esperado 413, veio ${res.status}`);
      assert(callsTo(stub.calls, PROVIDER).length === 0, "arquivo grande não chega ao provedor");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: arquivo vazio -> 400 e não toca o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleVoiceChanger(
        voiceRequest(formFor(new File([], "audio.ogg", { type: "audio/ogg" }))),
      );
      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      assert(callsTo(stub.calls, PROVIDER).length === 0, "arquivo vazio não chega ao provedor");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: conteúdo que NÃO é áudio (com type audio/mpeg mentindo) -> 415", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const texto = new TextEncoder().encode("isto nao e um audio, e um roteiro");
      const res = await handleVoiceChanger(
        voiceRequest(formFor(new File([texto], "audio.mp3", { type: "audio/mpeg" }))),
      );
      assert(res.status === 415, `esperado 415, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "conteúdo não-áudio não pode ser enviado ao provedor (o type do cliente mente)",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: preset fora do catálogo -> 400 antes do POST ao provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleVoiceChanger(
        voiceRequest(formFor(new File([oggBytes()], "audio.ogg", { type: "audio/ogg" }), "voz-clonada")),
      );
      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      assert(callsTo(stub.calls, PROVIDER).length === 0, "preset inválido não toca o provedor");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: upload válido segue e devolve o áudio do provedor (1 POST, modelo do produto)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleVoiceChanger(
        voiceRequest(formFor(new File([oggBytes()], "audio.ogg", { type: "audio/ogg" }))),
      );
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const externas = callsTo(stub.calls, PROVIDER);
      assert(externas.length === 1, `esperado 1 POST ao provedor, veio ${externas.length}`);
      const corpo = externas[0].init?.body as FormData;
      assert(
        corpo.get("model_id") === "eleven_multilingual_sts_v2",
        `modelo do produto esperado, veio ${String(corpo.get("model_id"))}`,
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert(bytes.byteLength === 4, `áudio esperado com 4 bytes, veio ${bytes.byteLength}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("SL-013: a conversão paga deixa UMA linha em ai_usage_logs (unidade segundo, tokens NULL)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleVoiceChanger(
        voiceRequest(formFor(new File([oggBytes()], "audio.ogg", { type: "audio/ogg" }))),
      );
      assert(res.status === 200, `esperado 200, veio ${res.status}`);

      const inserts = callsTo(stub.calls, "/rest/v1/ai_usage_logs")
        .filter((c) => c.init?.method === "POST");
      assert(inserts.length === 1, `esperado 1 insert no ledger, veio ${inserts.length}`);

      const linha = linhaDoLedger(stub.calls);
      assert(linha !== null, "o insert no ledger chegou sem corpo");
      assert(
        linha!.function_name === "voice-changer",
        `function_name inesperado: ${String(linha!.function_name)}`,
      );
      assert(linha!.status === "success", `status inesperado: ${String(linha!.status)}`);
      assert(linha!.user_id === USER_ID, `user_id inesperado: ${String(linha!.user_id)}`);
      // IA-053: a unidade cobrada do provedor NÃO é token — "não medido" nunca
      // pode virar zero medido nas colunas de token.
      assert(
        linha!.input_tokens === null && linha!.output_tokens === null,
        `tokens devem ser NULL quando não medidos: ${JSON.stringify(linha)}`,
      );
      const metadata = (linha!.metadata ?? {}) as Record<string, unknown>;
      assert(metadata.provider === "elevenlabs", `provider inesperado: ${JSON.stringify(metadata)}`);
      assert(metadata.billing_unit === "second", `unidade inesperada: ${JSON.stringify(metadata)}`);
      assert(metadata.usage_unknown === true, "consumo sem medição tem de ser DECLARADO no metadata");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: timeout do provedor -> 504 claro e a tentativa PAGA continua no ledger", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT,
      ROTA_LEDGER,
      {
        match: PROVIDER,
        make: () => {
          throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
        },
      },
    ]);
    try {
      const res = await handleVoiceChanger(
        voiceRequest(formFor(new File([oggBytes()], "audio.ogg", { type: "audio/ogg" }))),
      );
      assert(res.status === 504, `esperado 504, veio ${res.status}`);
      const body = await res.json() as { error?: string };
      assert(
        typeof body.error === "string" && body.error.length > 0,
        `esperado corpo de erro claro, veio: ${JSON.stringify(body)}`,
      );

      const linha = linhaDoLedger(stub.calls);
      assert(linha !== null, "a chamada que estourou o tempo continua sendo consumo: falta a linha no ledger");
      assert(linha!.status === "error", `status inesperado: ${String(linha!.status)}`);
    } finally {
      stub.restore();
    }
  });
});

// Armadilha do revisor no PH-06 (13/10): `AbortSignal.timeout` num fetch cujo corpo
// é lido DEPOIS pode cortar a resposta no meio do download. Aqui o corpo volta como
// buffer (não há streaming para o cliente) e é lido dentro do MESMO relógio — então
// um provedor lento mas dentro do prazo tem de sair 200 com o áudio inteiro.
Deno.test("G3: resposta lenta do provedor dentro do prazo -> 200 com o corpo inteiro", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT,
      ROTA_LEDGER,
      {
        match: PROVIDER,
        make: () =>
          Promise.resolve(
            new Response(
              new ReadableStream({
                async start(controller) {
                  controller.enqueue(new Uint8Array([1, 2]));
                  await new Promise((resolve) => setTimeout(resolve, 40));
                  controller.enqueue(new Uint8Array([3, 4]));
                  controller.close();
                },
              }),
              { status: 200, headers: { "content-type": "audio/mpeg" } },
            ),
          ),
      },
    ]);
    try {
      const res = await handleVoiceChanger(
        voiceRequest(formFor(new File([oggBytes()], "audio.ogg", { type: "audio/ogg" }))),
      );
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert(bytes.byteLength === 4, `esperado o corpo inteiro (4 bytes), veio ${bytes.byteLength}`);

      const linha = linhaDoLedger(stub.calls);
      assert(
        linha?.status === "success",
        `ledger devia marcar success: ${JSON.stringify(linha)}`,
      );
    } finally {
      stub.restore();
    }
  });
});
