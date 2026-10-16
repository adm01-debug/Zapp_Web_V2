// IA-122 / IA-128 (Bloco 13 — Voz, transcrição, TTS e comandos) — o STS pago aceitava
// QUALQUER upload do cliente.
//
// Antes: `elevenlabs-sts` materializava o corpo inteiro (`req.formData()`) sem teto e
// repassava o arquivo ao provedor pago sem conferir tamanho nem conteúdo — um blob que
// só DIZIA ser áudio (ou um arquivo enorme) gastava memória e crédito antes de qualquer
// recusa. Aceite do achado: "arquivo ou roteiro abusivo é rejeitado sem processamento
// descontrolado".
//
// A prova roda o handler REAL com o `fetch` global stubado por trecho de URL:
// `/auth/v1/user` (requireAuth), `/rest/v1/rpc/consume_rate_limit` (enforceRateLimit) e
// `api.elevenlabs.io` — este último é o alvo do achado: os casos de recusa exigem ZERO
// chamada a ele.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/elevenlabs-sts/index.test.ts

import {
  handleElevenLabsSts,
  MAX_STS_AUDIO_BYTES,
  sniffStsAudioFormat,
  validateStsUpload,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "20000000-0000-0000-0000-00000000000c";

type Route = { match: string; make: () => Response };
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
const ROTAS_OK = [ROTA_AUTH, ROTA_RATE_LIMIT, ROTA_AUDIO];

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

function stsRequest(
  form: FormData,
  withAuth = true,
  extraHeaders: Record<string, string> = {},
): Request {
  const headers: Record<string, string> = { ...extraHeaders };
  if (withAuth) headers.Authorization = "Bearer token-de-teste";
  return new Request("https://stub.supabase.co/functions/v1/elevenlabs-sts", {
    method: "POST",
    headers,
    body: form,
  });
}

function formFor(file: File, voiceId = "voz-de-teste"): FormData {
  const form = new FormData();
  form.append("audio", file, "audio.ogg");
  form.append("voiceId", voiceId);
  return form;
}

function callsTo(calls: Call[], match: string): Call[] {
  return calls.filter((c) => c.url.includes(match));
}

/**
 * `File` de mentira para o limite sem alocar 25 MiB: só o que o validador usa
 * (`size` e `slice().arrayBuffer()`). O handler real recebe `File` de verdade nos
 * demais casos.
 */
function fakeFile(size: number, head: Uint8Array): File {
  return {
    size,
    slice: () => ({
      arrayBuffer: async () =>
        head.buffer.slice(head.byteOffset, head.byteOffset + head.byteLength),
    }),
  } as unknown as File;
}

Deno.test("IA-122: content-length acima do teto -> 413 ANTES de ler o corpo e sem POST", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      // `new Request(url, { body: FormData })` NÃO gera `content-length`, então o
      // teste o envia explicitamente: corpo pequeno e válido + cabeçalho anunciando
      // acima do teto. O 413 prova a fronteira do cabeçalho: sem esse bloco no
      // handler, este corpo passaria em `validateStsUpload` e sairia 200.
      const res = await handleElevenLabsSts(
        stsRequest(
          formFor(new File([oggBytes()], "audio.ogg", { type: "audio/ogg" })),
          true,
          { "content-length": String(MAX_STS_AUDIO_BYTES + 1) },
        ),
      );

      assert(res.status === 413, `esperado 413, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "corpo acima do teto não pode chegar ao provedor pago",
      );
      const body = await res.json() as { error?: string };
      assert(
        typeof body.error === "string" && body.error.includes(String(MAX_STS_AUDIO_BYTES)),
        `esperado erro citando o teto, veio: ${JSON.stringify(body)}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-122: upload maior que o teto no size real -> 413 (e não toca o provedor)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      // Caminho do `size` real: o `content-length` pode mentir para baixo, então o
      // validador confere os bytes anunciados pelo próprio `File`.
      const rejection = await validateStsUpload(fakeFile(MAX_STS_AUDIO_BYTES + 1, oggBytes()));
      assert(rejection !== null, "arquivo acima do teto tinha de ser recusado");
      assert(rejection.status === 413, `esperado 413, veio ${rejection.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "o validador não pode falar com o provedor",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-122: arquivo vazio -> 400", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleElevenLabsSts(
        stsRequest(formFor(new File([], "audio.ogg", { type: "audio/ogg" }))),
      );

      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      assert(callsTo(stub.calls, PROVIDER).length === 0, "arquivo vazio não chega ao provedor");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-122: conteúdo que NÃO é áudio (com type audio/mpeg mentindo) -> 415", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const texto = new TextEncoder().encode("isto nao e um audio, e um roteiro");
      const res = await handleElevenLabsSts(
        stsRequest(formFor(new File([texto], "audio.mp3", { type: "audio/mpeg" }))),
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

Deno.test("IA-122: assinatura reconhecida nos bytes (ogg/wav/webm/m4a/mp3) e null para resto", () => {
  assert(sniffStsAudioFormat(oggBytes()) === "ogg", "OggS tinha de ser reconhecido");
  assert(sniffStsAudioFormat(new TextEncoder().encode("nao-e-audio")) === null, "texto não é áudio");
  assert(sniffStsAudioFormat(new Uint8Array(0)) === null, "vazio não é áudio");

  const wav = new Uint8Array(16);
  wav.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  wav.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  assert(sniffStsAudioFormat(wav) === "wav", "RIFF/WAVE tinha de ser reconhecido");

  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
  assert(sniffStsAudioFormat(webm) === "webm", "EBML (webm) tinha de ser reconhecido");

  const m4a = new Uint8Array(16);
  m4a.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
  assert(sniffStsAudioFormat(m4a) === "m4a", "ISO-BMFF (m4a) tinha de ser reconhecido");

  const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
  assert(sniffStsAudioFormat(mp3) === "mp3", "frame MPEG tinha de ser reconhecido");
});

Deno.test("IA-122: upload válido segue e devolve o áudio do provedor (1 POST)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleElevenLabsSts(
        stsRequest(formFor(new File([oggBytes()], "audio.ogg", { type: "audio/ogg" }), "voz-ok")),
      );

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const externas = callsTo(stub.calls, PROVIDER);
      assert(externas.length === 1, `esperado 1 POST ao provedor, veio ${externas.length}`);
      assert(
        externas[0].url.includes("/v1/speech-to-speech/voz-ok"),
        `endpoint inesperado: ${externas[0].url}`,
      );
      assert(
        res.headers.get("content-type") === "audio/mpeg",
        `content-type inesperado: ${res.headers.get("content-type")}`,
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert(bytes.byteLength === 4, `áudio esperado com 4 bytes, veio ${bytes.byteLength}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("IA-122: sem bearer continua 401 e não toca o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleElevenLabsSts(
        stsRequest(formFor(new File([oggBytes()], "audio.ogg", { type: "audio/ogg" })), false),
      );
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(callsTo(stub.calls, PROVIDER).length === 0, "sem autenticação não se chama o provedor");
    } finally {
      stub.restore();
    }
  });
});
