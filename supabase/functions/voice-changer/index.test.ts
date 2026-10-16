// G3: o `voice-changer` endurecido — teto no cabeçalho, conteúdo real, ledger e
// 504. Só `handleVoiceChanger` é importado: o teste NUNCA sobe servidor nem fala
// com provedor de verdade (fetch é dublado; rede real daria 599 e falharia).
//
// Refazer 1 (R1): dois testes a mais, um por ponto da recusa —
//   R1 ponto 1: 200 com corpo que quebra no meio do download -> 500 (nunca 200
//     vazio) + linha do ledger com status 'error';
//   R1 ponto 2: campo `audio` como TEXTO -> 400 igual ao ausente.
//
// IA-009 / SL-010b: kill switch de capacidade de voz lido no SERVIDOR e ANTES de
// reservar limite ou tocar o provedor — os testes "kill switch" abaixo provam os
// três estados (desligada/ilegível/ligada).
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
//     supabase/functions/voice-changer/index.test.ts

import { handleVoiceChanger } from "./index.ts";
import { MAX_VOICE_CHANGER_AUDIO_BYTES } from "../_shared/sts-upload.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "30000000-0000-0000-0000-00000000000c";

const ENV_OK = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "stub-anon",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service",
  ELEVENLABS_API_KEY: "stub-elevenlabs",
};

function withEnv(env: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const anterior: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    anterior[k] = Deno.env.get(k);
    Deno.env.set(k, v);
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(anterior)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  });
}

function oggBytes(size = 64): Uint8Array<ArrayBuffer> {
  // 'OggS' + zeros: o suficiente para o farejador reconhecer o container.
  const out = new Uint8Array(new ArrayBuffer(size));
  out[0] = 0x4f;
  out[1] = 0x67;
  out[2] = 0x67;
  out[3] = 0x53;
  return out;
}

type Call = { url: string; init: RequestInit };
type Route = { match: string; body?: Uint8Array<ArrayBuffer> | Record<string, unknown> | unknown[]; status?: number; rawBody?: BodyInit };

function withFetch(routes: Route[]): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    calls.push({ url, init: init ?? {} });
    const route = routes.find((r) => url.includes(r.match));
    if (!route) {
      return new Response(JSON.stringify({ error: "rede real bloqueada no teste" }), {
        status: 599,
        headers: { "content-type": "application/json" },
      });
    }
    // R1 ponto 1: corpo cru (ex.: stream que quebra no meio) para simular o
    // provedor devolvendo 200 e falhando durante o download.
    if (route.rawBody !== undefined) {
      return new Response(route.rawBody, {
        status: route.status ?? 200,
        headers: { "content-type": "audio/mpeg" },
      });
    }
    const status = route.status ?? 200;
    if (route.body instanceof Uint8Array) {
      return new Response(route.body, {
        status,
        headers: { "content-type": "audio/mpeg" },
      });
    }
    return new Response(JSON.stringify(route.body ?? {}), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => {
    globalThis.fetch = original;
  } };
}

const PROVIDER = "api.elevenlabs.io/v1/speech-to-speech";

const ROTA_AUTH = {
  match: "stub.supabase.co/auth/v1/user",
  body: { id: USER_ID, aud: "authenticated" },
};
// R2-AUTH-022: `requireAuth` consulta a política de rede (RPC service_role)
// antes de liberar o handler — sem este stub o teste cai no 503 "Service
// unavailable" (indecidível), como já faz o teste do `elevenlabs-sts`.
const ROTA_NETPOLICY = {
  match: "/rest/v1/rpc/resolve_network_policy",
  body: [{ allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 }],
};
const ROTA_RATE_LIMIT = {
  match: "/rest/v1/rpc/consume_rate_limit",
  body: [{ allowed: true, remaining: 9 }],
};
const ROTA_AUDIO_OK = { match: PROVIDER, body: oggBytes(128) };
const ROTA_LEDGER = { match: "/rest/v1/ai_usage_logs", status: 201, body: {} };
const ROTA_FLAG_ON = { match: "/rest/v1/feature_flags", body: { enabled: true } };
const ROTAS_OK = [ROTA_AUTH, ROTA_NETPOLICY, ROTA_RATE_LIMIT, ROTA_AUDIO_OK, ROTA_LEDGER, ROTA_FLAG_ON];

function makeRequest(
  form: FormData,
  { auth = true, headers = {} as Record<string, string> } = {},
): Request {
  const h = new Headers(headers);
  if (auth) h.set("authorization", "Bearer token-valido");
  return new Request("https://stub.supabase.co/functions/v1/voice-changer", {
    method: "POST",
    headers: h,
    body: form,
  });
}

function validForm(voicePreset = "grave"): FormData {
  const form = new FormData();
  form.append("audio", new File([oggBytes()], "voz.ogg", { type: "audio/ogg" }));
  form.append("voice_preset", voicePreset);
  return form;
}

function callsTo(calls: Call[], match: string): Call[] {
  return calls.filter((c) => c.url.includes(match));
}

// ---------------------------------------------------------------------------
// G3: fronteiras que existiam no `elevenlabs-sts` e faltavam aqui.
// ---------------------------------------------------------------------------

Deno.test("G3: sem bearer continua 401 e não toca o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleVoiceChanger(makeRequest(validForm(), { auth: false }));
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "sem auth nada pode chegar ao provedor pago",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: content-length acima do teto -> 413 ANTES de ler o corpo", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleVoiceChanger(
        makeRequest(validForm(), {
          headers: { "content-length": String(MAX_VOICE_CHANGER_AUDIO_BYTES + 1) },
        }),
      );
      assert(res.status === 413, `esperado 413, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "corpo acima do teto não pode chegar ao provedor pago",
      );
      const body = await res.json() as { error?: string };
      assert(
        typeof body.error === "string" && body.error.includes(String(MAX_VOICE_CHANGER_AUDIO_BYTES)),
        `esperado erro citando o teto de 25 MiB, veio: ${JSON.stringify(body)}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: upload maior que o teto no size real -> 413 (content-length mente)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      // O `content-length` pode mentir para baixo: o `size` real do File decide.
      const form = new FormData();
      const grande = new File(
        [oggBytes(MAX_VOICE_CHANGER_AUDIO_BYTES + 1)],
        "grande.ogg",
        { type: "audio/ogg" },
      );
      form.append("audio", grande);
      form.append("voice_preset", "grave");
      const res = await handleVoiceChanger(
        makeRequest(form, { headers: { "content-length": "64" } }),
      );
      assert(res.status === 413, `esperado 413, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "arquivo acima do teto não pode chegar ao provedor pago",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: arquivo vazio -> 400 e não toca o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const form = new FormData();
      form.append("audio", new File([], "vazio.ogg", { type: "audio/ogg" }));
      form.append("voice_preset", "grave");
      const res = await handleVoiceChanger(makeRequest(form));
      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "arquivo vazio não pode chegar ao provedor pago",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: blob que só DIZ ser áudio -> 415 e não toca o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      // `File.type` vem do cliente e pode mentir: os bytes decidem.
      const form = new FormData();
      form.append(
        "audio",
        new File([new TextEncoder().encode("isto não é áudio")], "falso.ogg", {
          type: "audio/ogg",
        }),
      );
      form.append("voice_preset", "grave");
      const res = await handleVoiceChanger(makeRequest(form));
      assert(res.status === 415, `esperado 415, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "conteúdo que não é áudio não pode chegar ao provedor pago",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: preset fora do catálogo -> 400 ANTES do provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleVoiceChanger(makeRequest(validForm("preset_que_nao_existe")));
      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "preset inválido não pode virar chamada paga",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: upload válido -> 200 com áudio e chama o provedor uma vez", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleVoiceChanger(makeRequest(validForm()));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      assert(
        res.headers.get("content-type") === "audio/mpeg",
        `content-type tinha de ser áudio, veio ${res.headers.get("content-type")}`,
      );
      assert(
        callsTo(stub.calls, PROVIDER).length === 1,
        "o caminho feliz chama o provedor exatamente uma vez",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: timeout do provedor -> 504 com mensagem em pt-BR", async () => {
  await withEnv(ENV_OK, async () => {
    // O fetch dublado rejeita com o mesmo `DOMException` de nome `TimeoutError`
    // que o `AbortSignal.timeout` produz de verdade.
    const rotas = [
      ROTA_AUTH,
      ROTA_NETPOLICY,
      ROTA_RATE_LIMIT,
      ROTA_LEDGER,
      ROTA_FLAG_ON,
      {
        match: PROVIDER,
        status: 599,
        body: {},
        // O withFetch não sabe rejeitar: a rota do provedor é trocada abaixo.
      },
    ];
    const stub = withFetch(rotas);
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
      if (url.includes(PROVIDER)) {
        throw new DOMException("The operation timed out", "TimeoutError");
      }
      return original(input, init);
    }) as typeof fetch;
    try {
      const res = await handleVoiceChanger(makeRequest(validForm()));
      assert(res.status === 504, `esperado 504, veio ${res.status}`);
      const body = await res.json() as { error?: string };
      assert(
        typeof body.error === "string" && body.error.includes("60s"),
        `esperado mensagem de tempo esgotado citando 60s, veio: ${JSON.stringify(body)}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("G3: áudio lento que estoura os 60 s no meio do download -> 504", async () => {
  await withEnv(ENV_OK, async () => {
    // O relógio do `AbortSignal.timeout` cobre a resposta TODA: mesmo com 200 já
    // recebido, se o corpo travar no meio, o estouro continua sendo timeout.
    const stub = withFetch([ROTA_AUTH, ROTA_NETPOLICY, ROTA_RATE_LIMIT, ROTA_LEDGER, ROTA_FLAG_ON]);
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
      if (url.includes(PROVIDER)) {
        return new Response(
          new ReadableStream({
            start(controller) {
              const sinal = init?.signal;
              if (sinal) {
                sinal.addEventListener("abort", () => {
                  controller.error(
                    new DOMException("The operation timed out", "TimeoutError"),
                  );
                });
              }
            },
          }),
          { status: 200, headers: { "content-type": "audio/mpeg" } },
        );
      }
      return original(input, init);
    }) as typeof fetch;
    try {
      const res = await handleVoiceChanger(makeRequest(validForm()));
      assert(res.status === 504, `esperado 504, veio ${res.status}`);
    } finally {
      stub.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Refazer 1: os dois pontos da recusa, um teste por ponto.
// ---------------------------------------------------------------------------

/** A linha que o handler escreveu no ledger (insert no `ai_usage_logs`). */
function linhaDoLedger(calls: Call[]): Record<string, unknown> | null {
  const escrita = callsTo(calls, "/rest/v1/ai_usage_logs").at(-1);
  if (!escrita) return null;
  const corpo = (escrita.init as { body?: unknown }).body;
  if (typeof corpo !== "string") return null;
  const parsed: unknown = JSON.parse(corpo);
  if (Array.isArray(parsed)) return (parsed[0] ?? null) as Record<string, unknown> | null;
  return parsed as Record<string, unknown>;
}

Deno.test("R1 ponto 1: 200 com corpo que quebra no meio do download -> 500 (nunca 200 vazio) + ledger error", async () => {
  await withEnv(ENV_OK, async () => {
    // O provedor responde 200 mas a conexão cai no meio do corpo: `arrayBuffer()`
    // rejeita com erro COMUM (não-timeout). Antes da correção, o `audioBuffer`
    // nulo escorregava para `new Response(null)` com 200 vazio (pior: os `?? 0`
    // ainda zeravam o Content-Length, fingindo sucesso).
    const corpoQuebrado = new ReadableStream({
      start(controller) {
        controller.error(new Error("boom no meio do download"));
      },
    });
    const rotas: Route[] = [
      ROTA_AUTH,
      ROTA_NETPOLICY,
      ROTA_RATE_LIMIT,
      ROTA_LEDGER,
      ROTA_FLAG_ON,
      { match: PROVIDER, status: 200, rawBody: corpoQuebrado },
    ];
    const stub = withFetch(rotas);
    try {
      const res = await handleVoiceChanger(makeRequest(validForm()));
      assert(res.status === 500, `esperado 500, veio ${res.status}`);
      const body = await res.json() as { error?: string };
      // `errorResponse` higieniza 500 para genérico (não vaza detalhe
      // interno): o que importa aqui é 500 + ledger 'error', nunca 200 vazio.
      assert(
        typeof body.error === "string" && body.error.includes("Internal server error"),
        `esperado 500 genérico higienizado, veio: ${JSON.stringify(body)}`,
      );
      const linha = linhaDoLedger(stub.calls);
      assert(linha !== null, "a tentativa de chamada paga tem de ir ao ledger");
      assert(
        linha.status === "error",
        `o ledger tinha de marcar 'error', veio: ${JSON.stringify(linha.status)}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R1 ponto 1 (variante): 200 com corpo VAZIO -> 500 (nunca 200 vazio) + ledger error", async () => {
  await withEnv(ENV_OK, async () => {
    // O provedor responde 200 com zero bytes, sem erro de rede: o `arrayBuffer()`
    // resolve vazio. Antes da guarda de `byteLength`, saía 200 com corpo vazio.
    const rotas: Route[] = [
      ROTA_AUTH,
      ROTA_NETPOLICY,
      ROTA_RATE_LIMIT,
      ROTA_LEDGER,
      ROTA_FLAG_ON,
      { match: PROVIDER, status: 200, rawBody: new Uint8Array(0) },
    ];
    const stub = withFetch(rotas);
    try {
      const res = await handleVoiceChanger(makeRequest(validForm()));
      assert(res.status === 500, `esperado 500, veio ${res.status}`);
      const linha = linhaDoLedger(stub.calls);
      assert(linha !== null, "a tentativa de chamada paga tem de ir ao ledger");
      assert(
        linha.status === "error",
        `o ledger tinha de marcar 'error', veio: ${JSON.stringify(linha.status)}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R1 ponto 2: campo `audio` como TEXTO -> 400 igual ao ausente (sem 500)", async () => {
  await withEnv(ENV_OK, async () => {
    // String é truthy: o `!audioFile` antigo deixava passar e o `file.slice`
    // estourava em 500 genérico. `instanceof File` barra com 400 claro.
    const stub = withFetch(ROTAS_OK);
    try {
      const form = new FormData();
      form.append("audio", "sou-texto-nao-arquivo");
      form.append("voice_preset", "grave");
      const res = await handleVoiceChanger(makeRequest(form));
      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      const body = await res.json() as { error?: string };
      assert(
        typeof body.error === "string" &&
          body.error.includes("Arquivo de áudio é obrigatório"),
        `esperado 400 claro de áudio obrigatório, veio: ${JSON.stringify(body)}`,
      );
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "texto no lugar do áudio não pode chegar ao provedor pago",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R1 ponto 2 (ausente): sem campo `audio` -> 400", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const form = new FormData();
      form.append("voice_preset", "grave");
      const res = await handleVoiceChanger(makeRequest(form));
      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "sem áudio nada pode chegar ao provedor pago",
      );
    } finally {
      stub.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// IA-009 / SL-010b: kill switch de capacidade de voz.
// ---------------------------------------------------------------------------

Deno.test("kill switch: capacidade de voz DESLIGADA -> 503 sem tocar o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const rotas: Route[] = [
      ROTA_AUTH,
      ROTA_NETPOLICY,
      ROTA_RATE_LIMIT,
      ROTA_AUDIO_OK,
      ROTA_LEDGER,
      { match: "/rest/v1/feature_flags", body: { enabled: false } },
    ];
    const stub = withFetch(rotas);
    try {
      const res = await handleVoiceChanger(makeRequest(validForm()));
      assert(res.status === 503, `esperado 503, veio ${res.status}`);
      const payload = await res.json() as { code?: string };
      assert(
        payload.code === "AI_CAPABILITY_DISABLED",
        `esperado code AI_CAPABILITY_DISABLED, veio: ${JSON.stringify(payload)}`,
      );
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "capacidade desligada não pode tocar o provedor pago",
      );
      assert(
        callsTo(stub.calls, "/rest/v1/ai_usage_logs").length === 0,
        "capacidade desligada não pode registrar consumo",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("kill switch: leitura da flag FALHA -> 503 fail-closed sem tocar o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const rotas: Route[] = [
      ROTA_AUTH,
      ROTA_NETPOLICY,
      ROTA_RATE_LIMIT,
      ROTA_AUDIO_OK,
      ROTA_LEDGER,
      { match: "/rest/v1/feature_flags", status: 599, body: {} },
    ];
    const stub = withFetch(rotas);
    try {
      const res = await handleVoiceChanger(makeRequest(validForm()));
      assert(res.status === 503, `esperado 503 fail-closed, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 0,
        "leitura não confiável fecha: nada pode chegar ao provedor pago",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("kill switch: capacidade LIGADA -> alcança o provedor e devolve 200", async () => {
  await withEnv(ENV_OK, async () => {
    // Áudio ogg VÁLIDO (magic bytes): com o endurecimento G3, bytes
    // [1,2,3,4] seriam barrados em 415 antes do provedor — o caminho feliz
    // precisa de um container de verdade.
    const rotas: Route[] = [
      ROTA_AUTH,
      ROTA_NETPOLICY,
      ROTA_RATE_LIMIT,
      ROTA_LEDGER,
      ROTA_FLAG_ON,
      { match: PROVIDER, body: oggBytes(32) },
    ];
    const stub = withFetch(rotas);
    try {
      const res = await handleVoiceChanger(makeRequest(validForm()));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      assert(
        callsTo(stub.calls, PROVIDER).length === 1,
        "capacidade ligada tem de alcançar o provedor",
      );
    } finally {
      stub.restore();
    }
  });
});

// Só sobe o servidor quando executada como Edge Function (permite importar o
// handler no teste, como nas demais funções desta família).
if (import.meta.main) {
  Deno.serve(handleVoiceChanger);
}
