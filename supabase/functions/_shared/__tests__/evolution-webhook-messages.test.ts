/**
 * G1 — contrato executável da AUTO-TRANSCRIÇÃO no webhook de mensagens.
 *
 * Defeito: `handleAudioTranscription` gravava `transcription: result.text`, mas a
 * Edge `ai-transcribe-audio` responde `{ transcription }`. Todo áudio recebido
 * pagava uma transcrição e gravava texto NULO como `completed` (o selo
 * "Transcrito" do player só aparece com texto, então o defeito era invisível).
 *
 * O teste chama o handler REAL com um `fetch` falso (a Edge) e um client falso e
 * trava:
 *   1. `{transcription:'oi'}` deixa a linha com o TEXTO e `completed`;
 *   2. resposta 200 SEM texto (fallback de formato) vira `failed`, NUNCA
 *      `completed` vazio;
 *   3. resposta não-ok (5xx) vira `failed`;
 *   4. `auto_transcription_enabled = 'false'` não dispara nada.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/evolution-webhook-messages.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleAudioTranscription } from "../evolution-webhook-messages.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

interface UpdateCall {
  table: string;
  values: Record<string, unknown>;
}

/** Client falso: registra cada UPDATE e responde as leituras de configuração. */
function fakeDb(updates: UpdateCall[], autoTranscription = "true"): EvolutionDbClient {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const same = () => chain;
    for (const metodo of ["select", "eq", "is", "in", "not", "gte", "order", "limit", "insert", "upsert", "delete"]) {
      chain[metodo] = same;
    }
    // `.update(valores)` guarda os valores e resolve no primeiro `await` da cadeia.
    chain.update = (values: Record<string, unknown>) => {
      chain.then = (resolve: (v: unknown) => unknown) => {
        updates.push({ table, values });
        return resolve({ data: null, error: null });
      };
      return chain;
    };
    chain.maybeSingle = () =>
      Promise.resolve({
        data: table === "global_settings" ? { value: autoTranscription } : null,
        error: null,
      });
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return chain;
  };
  return { from: (t: string) => builder(t) } as unknown as EvolutionDbClient;
}

async function runTranscription(opts: {
  response: () => Response;
  autoTranscription?: string;
}): Promise<{ updates: UpdateCall[]; messages: UpdateCall[]; calls: string[] }> {
  const updates: UpdateCall[] = [];
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    calls.push(String(input));
    return Promise.resolve(opts.response());
  }) as typeof fetch;
  try {
    await handleAudioTranscription(
      fakeDb(updates, opts.autoTranscription),
      "contact-1",
      "msg-1",
      "https://local.test/storage/v1/object/public/whatsapp-media/audio.ogg",
      "https://projeto.supabase.co",
      "service-key-de-teste",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  return { updates, messages: updates.filter((u) => u.table === "messages"), calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.test(
  "G1: `{transcription:'oi'}` deixa a linha com o TEXTO e status completed",
  async () => {
    const { messages, calls } = await runTranscription({
      response: () => jsonResponse({ transcription: "oi" }),
    });

    assertEquals(calls.length, 1, "o webhook dispara a Edge de transcrição uma vez");
    assertEquals(
      messages[0].values.transcription_status,
      "processing",
      "marca processing antes de pagar o provedor",
    );
    const last = messages[messages.length - 1];
    assertEquals(last.values.transcription, "oi", "grava o TEXTO que a Edge devolveu (não result.text)");
    assertEquals(last.values.transcription_status, "completed", "conclui como completed");
    assertEquals(
      messages.some((u) => u.values.transcription_status === "completed" && !u.values.transcription),
      false,
      "nenhum caminho pode gravar completed sem texto",
    );
  },
);

Deno.test(
  "G1: resposta 200 sem texto (fallback de formato) vira failed, nunca completed vazio",
  async () => {
    const { messages } = await runTranscription({
      response: () => jsonResponse({ transcription: "", fallback: true, error: "INVALID_AUDIO" }),
    });

    const last = messages[messages.length - 1];
    assertEquals(last.values.transcription_status, "failed", "sem texto o estado é failed");
    assertEquals(
      "transcription" in last.values,
      false,
      "não escreve texto nenhum quando não há texto",
    );
    assertEquals(
      messages.some((u) => u.values.transcription_status === "completed"),
      false,
      "não pode marcar completed com texto vazio",
    );
  },
);

Deno.test("G1: resposta não-ok (5xx) marca failed", async () => {
  const { messages } = await runTranscription({
    response: () => new Response("boom", { status: 500 }),
  });

  const last = messages[messages.length - 1];
  assertEquals(last.values.transcription_status, "failed", "erro da Edge vira failed");
});

Deno.test("G1: auto_transcription_enabled='false' não dispara transcrição", async () => {
  const { calls, messages } = await runTranscription({
    response: () => jsonResponse({ transcription: "oi" }),
    autoTranscription: "false",
  });

  assertEquals(calls.length, 0, "nada é enviado à Edge quando a transcrição automática está desligada");
  assertEquals(messages.length, 0, "nenhum UPDATE em messages");
});
