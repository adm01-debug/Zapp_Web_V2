// IA-009 — caminho NEGADO do kill switch em ai-transcribe-audio.
// Prova o handler real: capacidade/provedor desligados devolvem 503/AI_DISABLED
// antes de baixar o áudio e antes de chamar a ElevenLabs.
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-transcribe-audio/index.test.ts

import { handleTranscribeAudio } from "./index.ts";

function afirma(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(mensagem);
}

function igual(recebido: unknown, esperado: unknown, mensagem: string) {
  if (recebido !== esperado) {
    throw new Error(`${mensagem} — recebi ${JSON.stringify(recebido)}, esperava ${JSON.stringify(esperado)}`);
  }
}

const SUPABASE_URL = "https://stub.supabase.co";
const SERVICE_KEY = "service-role-key-de-teste";
const CAPABILITY_KEY = "ai.capability.transcribe_audio";
const PROVIDER_KEY = "ai.provider.elevenlabs";

function withEnv(fn: () => Promise<void>) {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries({
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    ELEVENLABS_API_KEY: "nao-deve-ser-usada",
  })) {
    saved.set(key, Deno.env.get(key));
    Deno.env.set(key, value);
  }
  return fn().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

function withFetch(flags: Array<{ key: string; enabled: boolean }>) {
  const original = globalThis.fetch;
  const chamadas: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    chamadas.push(`${init?.method ?? (input instanceof Request ? input.method : "GET")} ${url}`);
    const alvo = new URL(url);
    if (alvo.pathname.endsWith("/rest/v1/feature_flags")) {
      return Promise.resolve(new Response(JSON.stringify(flags), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    }
    return Promise.resolve(new Response(JSON.stringify({ erro: `nao deveria chamar ${url}` }), { status: 599 }));
  }) as typeof fetch;
  return { chamadas, restore: () => { globalThis.fetch = original; } };
}

function request(): Request {
  return new Request("https://stub.supabase.co/functions/v1/ai-transcribe-audio", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      audioUrl: `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/audio.ogg`,
      messageId: "msg-1",
      languageCode: "por",
    }),
  });
}

async function esperaNegado(flags: Array<{ key: string; enabled: boolean }>, rotulo: string) {
  await withEnv(async () => {
    const stub = withFetch(flags);
    try {
      const res = await handleTranscribeAudio(request());
      igual(res.status, 503, `${rotulo}: status do bloqueio`);
      const corpo = await res.json() as { error?: { code?: string } };
      igual(corpo.error?.code, "AI_DISABLED", `${rotulo}: corpo precisa trazer codigo explicito`);
      afirma(
        stub.chamadas.some((c) => c.includes("/rest/v1/feature_flags")),
        `${rotulo}: precisa ler feature_flags no servidor`,
      );
      afirma(
        !stub.chamadas.some((c) => c.includes("/storage/v1/object") || c.includes("api.elevenlabs.io")),
        `${rotulo}: bloqueio nao pode baixar audio nem chamar ElevenLabs: ${stub.chamadas.join(" | ")}`,
      );
    } finally {
      stub.restore();
    }
  });
}

Deno.test("IA-009 ai-transcribe-audio: capacidade desligada → 503/AI_DISABLED sem download nem ElevenLabs", async () => {
  await esperaNegado([
    { key: CAPABILITY_KEY, enabled: false },
    { key: PROVIDER_KEY, enabled: true },
  ], "capacidade desligada");
});

Deno.test("IA-009 ai-transcribe-audio: provedor ElevenLabs desligado → 503/AI_DISABLED sem download nem ElevenLabs", async () => {
  await esperaNegado([
    { key: CAPABILITY_KEY, enabled: true },
    { key: PROVIDER_KEY, enabled: false },
  ], "provedor desligado");
});
