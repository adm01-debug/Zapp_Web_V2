// R2-API-024 (P2) — Diálogo ElevenLabs envia `script` e omite `inputs`.
//
// O provedor exige `inputs` (lista de {text, voice_id}) em
// POST /v1/text-to-dialogue; o adaptador repassava o nome interno `script`.
//
// Aceite do achado:
//   - o adaptador traduz o contrato interno (`script`) para `inputs`, e o corpo
//     externo NÃO leva `script`;
//   - limites agregados do provedor (10 vozes distintas, 2.000 caracteres no
//     total) são recusados ANTES do POST, com 400 e mensagem útil;
//   - cenário válido chega ao retorno de áudio.
//
// O handler REAL roda com o `fetch` global stubado por trecho de URL:
// `/auth/v1/user` (requireAuth), `/rest/v1/rpc/consume_rate_limit`
// (enforceRateLimit) e `api.elevenlabs.io` — este último é o alvo do achado e o
// corpo enviado é capturado e conferido.
import {
  handleElevenLabsDialogue,
  MAX_DIALOGUE_CHARS,
  MAX_DIALOGUE_VOICES,
} from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "20000000-0000-0000-0000-00000000000b";

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

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ELEVENLABS_API_KEY",
] as const;

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

const ENV_OK = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-de-teste",
  ELEVENLABS_API_KEY: "xi-key-de-teste",
};

const ROTA_AUTH: Route = {
  match: "/auth/v1/user",
  make: () => jsonResp({ id: USER_ID, aud: "authenticated" }),
};
const ROTA_RATE_LIMIT: Route = {
  match: "/rest/v1/rpc/consume_rate_limit",
  make: () => jsonResp([{ allowed: true, remaining: 19 }]),
};
const ROTA_AUDIO: Route = {
  match: "api.elevenlabs.io",
  make: () =>
    new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    }),
};
// SL-013 / IA-003 B6 — o ledger de consumo. A chamada PAGA tem de gravar linha
// em `ai_usage_logs`; o PostgREST do supabase-js passa pelo mesmo `fetch`
// stubado (a função cria o cliente com a service role e faz o insert).
const ROTA_LEDGER: Route = {
  match: "/rest/v1/ai_usage_logs",
  make: () => jsonResp(null, 201),
};
const ROTA_PROFILES: Route = {
  match: "/rest/v1/profiles",
  make: () => jsonResp([{ id: "30000000-0000-0000-0000-00000000000c" }]),
};
const ROTAS_OK = [ROTA_AUTH, ROTA_RATE_LIMIT, ROTA_AUDIO, ROTA_LEDGER, ROTA_PROFILES];

function makeRequest(body: unknown, withAuth = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (withAuth) headers.Authorization = "Bearer token-de-teste";
  return new Request("https://stub.supabase.co/functions/v1/elevenlabs-dialogue", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function dialogueBody(script: unknown) {
  return { script, languageCode: "pt" };
}

function callsTo(calls: Call[], match: string): Call[] {
  return calls.filter((c) => c.url.includes(match));
}

Deno.test("R2-API-024: corpo externo leva `inputs` (text/voice_id) e NÃO leva `script`", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleElevenLabsDialogue(makeRequest(dialogueBody([
        { voice_id: "voz-a", text: "Bom dia" },
        { voice_id: "voz-b", text: "Boa tarde" },
      ])));

      assert(res.status === 200, `esperado 200, veio ${res.status}`);
      const externas = callsTo(stub.calls, "api.elevenlabs.io");
      assert(externas.length === 1, `esperado 1 POST ao provedor, veio ${externas.length}`);
      assert(
        externas[0].url.includes("/v1/text-to-dialogue"),
        `endpoint inesperado: ${externas[0].url}`,
      );

      const payload = JSON.parse(String(externas[0].init?.body)) as Record<string, unknown>;
      assert(
        JSON.stringify(payload.inputs) === JSON.stringify([
          { text: "Bom dia", voice_id: "voz-a" },
          { text: "Boa tarde", voice_id: "voz-b" },
        ]),
        `inputs (obrigatório do provedor) inesperado: ${JSON.stringify(payload)}`,
      );
      assert(
        !("script" in payload),
        `o corpo externo não pode levar o nome interno script: ${JSON.stringify(payload)}`,
      );
      assert(payload.model_id === "eleven_v3", `model_id inesperado: ${payload.model_id}`);
      assert(payload.language_code === "pt", `language_code inesperado: ${payload.language_code}`);

      // cenário válido chega ao retorno de áudio
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

Deno.test(`R2-API-024: mais de ${MAX_DIALOGUE_VOICES} vozes distintas -> 400 antes do POST`, async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const script = Array.from({ length: MAX_DIALOGUE_VOICES + 1 }, (_, i) => ({
        voice_id: `voz-${i}`,
        text: `fala ${i}`,
      }));
      const res = await handleElevenLabsDialogue(makeRequest(dialogueBody(script)));

      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      assert(
        callsTo(stub.calls, "api.elevenlabs.io").length === 0,
        "recusa de limite tem de acontecer antes do POST ao provedor",
      );
      const body = await res.json() as { error?: string };
      assert(
        typeof body.error === "string" && body.error.includes(String(MAX_DIALOGUE_VOICES)),
        `esperado erro útil citando o limite, veio: ${JSON.stringify(body)}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test(`R2-API-024: texto somado acima de ${MAX_DIALOGUE_CHARS} caracteres -> 400 antes do POST`, async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const metade = "a".repeat(Math.ceil((MAX_DIALOGUE_CHARS + 1) / 2));
      const res = await handleElevenLabsDialogue(makeRequest(dialogueBody([
        { voice_id: "voz-a", text: metade },
        { voice_id: "voz-b", text: metade },
      ])));

      assert(res.status === 400, `esperado 400, veio ${res.status}`);
      assert(
        callsTo(stub.calls, "api.elevenlabs.io").length === 0,
        "recusa de limite tem de acontecer antes do POST ao provedor",
      );
      const body = await res.json() as { error?: string };
      assert(
        typeof body.error === "string" && body.error.includes(String(MAX_DIALOGUE_CHARS)),
        `esperado erro útil citando o limite, veio: ${JSON.stringify(body)}`,
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-API-024: no limite exato do contrato o diálogo segue para o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const porFala = Math.floor(MAX_DIALOGUE_CHARS / MAX_DIALOGUE_VOICES);
      const script = Array.from({ length: MAX_DIALOGUE_VOICES }, (_, i) => ({
        voice_id: `voz-${i}`,
        text: "b".repeat(porFala),
      }));
      const res = await handleElevenLabsDialogue(makeRequest(dialogueBody(script)));

      assert(res.status === 200, `no limite exato o provedor deveria ser chamado (veio ${res.status})`);
      assert(
        callsTo(stub.calls, "api.elevenlabs.io").length === 1,
        "o limite exato é permitido pelo contrato",
      );
      const payload = JSON.parse(
        String(callsTo(stub.calls, "api.elevenlabs.io")[0].init?.body),
      ) as { inputs?: unknown[] };
      assert(payload.inputs?.length === MAX_DIALOGUE_VOICES, `inputs incompleto: ${JSON.stringify(payload)}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test("R2-API-024: sem bearer continua 401 e não toca o provedor", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const res = await handleElevenLabsDialogue(
        makeRequest(dialogueBody([{ voice_id: "voz-a", text: "oi" }]), false),
      );
      assert(res.status === 401, `esperado 401, veio ${res.status}`);
      assert(
        callsTo(stub.calls, "api.elevenlabs.io").length === 0,
        "sem autenticação não se chama o provedor",
      );
    } finally {
      stub.restore();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SL-013 / IA-003 B6 — toda chamada PAGA gera linha no ledger (ai_usage_logs).
//
// Defeito: a geração paga ia ao provedor e NÃO registrava consumo em lugar
// nenhum — o relatório de custo (IA-058) ficava cego para o gasto do ElevenLabs.
// O teste abaixo roda o handler REAL com o `fetch` stubado e prova que a
// chamada ao provedor deixa exatamente UMA linha no ledger, com a unidade
// cobrada do provedor (caractere) e as colunas de token em NULL (IA-053).
// ───────────────────────────────────────────────────────────────────────────

/** A linha que o PostgREST recebeu (o supabase-js manda objeto ou [objeto]). */
function linhaDoLedger(calls: Call[]): Record<string, unknown> | null {
  const post = callsTo(calls, "/rest/v1/ai_usage_logs").find((c) => c.init?.method === "POST");
  if (!post || post.init?.body === undefined || post.init?.body === null) return null;
  const corpo = JSON.parse(String(post.init.body)) as
    | Record<string, unknown>
    | Record<string, unknown>[];
  return (Array.isArray(corpo) ? corpo[0] : corpo) ?? null;
}

Deno.test("SL-013: diálogo pago deixa UMA linha em ai_usage_logs (unidade caractere, tokens NULL)", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch(ROTAS_OK);
    try {
      const script = [
        { voice_id: "voz-a", text: "Bom dia" }, // 7 caracteres
        { voice_id: "voz-b", text: "Boa tarde" }, // 9 caracteres
      ];
      const res = await handleElevenLabsDialogue(makeRequest(dialogueBody(script)));
      assert(res.status === 200, `esperado 200, veio ${res.status}`);

      const inserts = callsTo(stub.calls, "/rest/v1/ai_usage_logs")
        .filter((c) => c.init?.method === "POST");
      assert(inserts.length === 1, `esperado 1 insert no ledger, veio ${inserts.length}`);

      const linha = linhaDoLedger(stub.calls);
      assert(linha !== null, "o insert no ledger chegou sem corpo");
      assert(
        linha!.function_name === "elevenlabs-dialogue",
        `function_name inesperado: ${String(linha!.function_name)}`,
      );
      assert(linha!.status === "success", `status inesperado: ${String(linha!.status)}`);
      assert(linha!.user_id === USER_ID, `user_id inesperado: ${String(linha!.user_id)}`);
      assert(linha!.model === "eleven_v3", `model inesperado: ${String(linha!.model)}`);
      // IA-053: a unidade cobrada do provedor NÃO é token — "não medido" nunca
      // pode virar zero medido nas colunas de token.
      assert(
        linha!.input_tokens === null && linha!.output_tokens === null,
        `tokens devem ser NULL quando não medidos: ${JSON.stringify(linha)}`,
      );
      const metadata = (linha!.metadata ?? {}) as Record<string, unknown>;
      assert(metadata.provider === "elevenlabs", `provider inesperado: ${JSON.stringify(metadata)}`);
      assert(metadata.billing_unit === "character", `unidade inesperada: ${JSON.stringify(metadata)}`);
      assert(
        metadata.billing_quantity === 16,
        `caracteres somados do roteiro (7+9) inesperados: ${String(metadata.billing_quantity)}`,
      );
      assert(metadata.usage_unknown === true, "consumo sem medição tem de ser DECLARADO no metadata");
    } finally {
      stub.restore();
    }
  });
});

Deno.test("SL-013: falha do provedor também deixa linha (status error) e a unidade é medida igual", async () => {
  await withEnv(ENV_OK, async () => {
    const stub = withFetch([
      ROTA_AUTH,
      ROTA_RATE_LIMIT,
      ROTA_PROFILES,
      ROTA_LEDGER,
      { match: "api.elevenlabs.io", make: () => jsonResp({ detail: "boom" }, 500) },
    ]);
    try {
      const res = await handleElevenLabsDialogue(
        makeRequest(dialogueBody([{ voice_id: "voz-a", text: "Bom dia" }])),
      );
      assert(res.status === 500, `esperado 500 do provedor, veio ${res.status}`);

      const linha = linhaDoLedger(stub.calls);
      assert(linha !== null, "chamada paga que falhou continua sendo consumo: falta a linha no ledger");
      assert(linha!.status === "error", `status inesperado: ${String(linha!.status)}`);
      const metadata = (linha!.metadata ?? {}) as Record<string, unknown>;
      assert(metadata.http_status === 500, `http_status inesperado: ${JSON.stringify(metadata)}`);
      assert(metadata.billing_quantity === 7, `caracteres do roteiro inesperados: ${String(metadata.billing_quantity)}`);
    } finally {
      stub.restore();
    }
  });
});
