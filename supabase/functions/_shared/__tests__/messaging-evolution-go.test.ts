// F41 — adaptador único de envio pelo Evolution GO.
// Prova que `send()` monta o payload v2 correto por tipo (texto/imagem/documento/
// áudio/PTT), aplica a presença composing/recording conforme o tipo e usa o
// `evolution-go-routes.ts` (rota GO final), tudo com fetch injetado — sem rede.

import { assertEquals, assert, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { capabilities, send, presenceForKind, MessagingError } from "../messaging/evolution-go.ts";
import type { SendDeps, SendItem } from "../messaging/evolution-go.ts";

type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

interface FetchCall {
  url: string;
  method: string;
  apikey: string;
  contentType: string;
  body: Record<string, unknown> | undefined;
}

const okResponse = () =>
  new Response(JSON.stringify({ data: { Info: { ID: "GO-MSG-1" } } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function recordingFetcher(response: () => Response = okResponse): { calls: FetchCall[]; fetcher: Fetcher } {
  const calls: FetchCall[] = [];
  const fetcher: Fetcher = (url, options) => {
    const headers = (options.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: options.method ?? "GET",
      apikey: headers.apikey ?? "",
      contentType: headers["Content-Type"] ?? "",
      body: typeof options.body === "string" ? JSON.parse(options.body) as Record<string, unknown> : undefined,
    });
    return Promise.resolve(response());
  };
  return { calls, fetcher };
}

function depsForFlavor(f: "go" | "v2", fetcher: Fetcher): SendDeps {
  return {
    fetch: fetcher,
    evolutionUrl: "https://go.exemplo.com",
    evolutionKey: "admin-key",
    instanceToken: "token-instancia",
    // FIXA a flavor: este arquivo testa o adaptador GO. Sem fixar, um teste de outro
    // arquivo que seta EVOLUTION_API_FLAVOR=v2 (env e global no mesmo processo) faz
    // estes casos falharem por um motivo que nao tem nada a ver com o adaptador.
    flavor: f,
  };
}

/** Casos do adaptador GO — a flavor que ele implementa. */
function depsFor(fetcher: Fetcher): SendDeps {
  return depsForFlavor("go", fetcher);
}

// ── (a) capabilities por tipo ───────────────────────────────────────────────

Deno.test("F41 capabilities(): texto, imagem, documento, áudio e PTT habilitados com limite de caracteres", () => {
  const c = capabilities();
  assertEquals(c.text, true);
  assertEquals(c.image, true);
  assertEquals(c.document, true);
  assertEquals(c.audio, true);
  assertEquals(c.ptt, true);
  assert(c.maxTextChars > 0, "maxTextChars deve ser positivo");
});

Deno.test("F41 presenceForKind(): PTT grava (recording); os demais digitam (composing)", () => {
  assertEquals(presenceForKind("ptt"), "recording");
  assertEquals(presenceForKind("text"), "composing");
  assertEquals(presenceForKind("image"), "composing");
  assertEquals(presenceForKind("document"), "composing");
  assertEquals(presenceForKind("audio"), "composing");
});

// ── (b) send(): payload certo + presença certa por tipo ─────────────────────

Deno.test("F41 send(texto): presença composing e POST /send/text", async () => {
  const { calls, fetcher } = recordingFetcher();
  const item: SendItem = { kind: "text", to: "5511999999999", instanceId: "inst-a", text: "Olá {{nome}}" };

  const result = await send(item, depsFor(fetcher));

  assertEquals(calls.length, 2, "1 chamada de presença + 1 de mensagem");
  // presença
  assert(calls[0].url.endsWith("/message/presence"), `presença esperada, veio ${calls[0].url}`);
  assertEquals(calls[0].body?.state, "composing");
  assertEquals(calls[0].body?.number, "5511999999999");
  assertEquals("isAudio" in (calls[0].body ?? {}), false);
  // mensagem
  assert(calls[1].url.endsWith("/send/text"), `envio esperado, veio ${calls[1].url}`);
  assertEquals(calls[1].method, "POST");
  assertEquals(calls[1].body?.text, "Olá {{nome}}");
  assertEquals(calls[1].body?.number, "5511999999999");
  assertEquals(calls[1].apikey, "token-instancia");
  // resultado
  assertEquals(result.ok, true);
  assertEquals(result.presence, "composing");
  assertEquals(result.messageId, "GO-MSG-1");
  assertEquals(result.goPath, "/send/text");
});

Deno.test("F41 send(imagem): /send/media type=image com legenda", async () => {
  const { calls, fetcher } = recordingFetcher();
  const result = await send(
    { kind: "image", to: "5511999999999", instanceId: "inst-a", mediaUrl: "https://cdn/x.png", text: "olha isso" },
    depsFor(fetcher),
  );

  assertEquals(calls[0].body?.state, "composing");
  assert(calls[1].url.endsWith("/send/media"));
  assertEquals(calls[1].body?.type, "image");
  assertEquals(calls[1].body?.url, "https://cdn/x.png");
  assertEquals(calls[1].body?.caption, "olha isso");
  assertEquals(result.presence, "composing");
});

Deno.test("F41 send(documento): /send/media type=document com filename", async () => {
  const { calls, fetcher } = recordingFetcher();
  await send(
    {
      kind: "document", to: "5511999999999", instanceId: "inst-a",
      mediaUrl: "https://cdn/contrato.pdf", fileName: "contrato.pdf", text: "segue o contrato",
    },
    depsFor(fetcher),
  );

  assert(calls[1].url.endsWith("/send/media"));
  assertEquals(calls[1].body?.type, "document");
  assertEquals(calls[1].body?.filename, "contrato.pdf");
  assertEquals(calls[1].body?.caption, "segue o contrato");
});

Deno.test("F41 send(documento) sem fileName falha antes de tocar a rede", async () => {
  let touched = false;
  const fetcher: Fetcher = () => {
    touched = true;
    return Promise.resolve(okResponse());
  };
  await assertRejects(
    () => send({ kind: "document", to: "5511999999999", instanceId: "inst-a", mediaUrl: "https://cdn/x.pdf" }, depsFor(fetcher)),
    MessagingError,
  );
  assertEquals(touched, false);
});

Deno.test("F41 send(áudio comum): /send/media type=audio (não é nota de voz)", async () => {
  const { calls, fetcher } = recordingFetcher();
  const result = await send(
    { kind: "audio", to: "5511999999999", instanceId: "inst-a", mediaUrl: "https://cdn/audio.mp3" },
    depsFor(fetcher),
  );

  assertEquals(calls[0].body?.state, "composing");
  assert(calls[1].url.endsWith("/send/media"));
  assertEquals(calls[1].body?.type, "audio");
  assertEquals(calls[1].body?.url, "https://cdn/audio.mp3");
  assertEquals(result.presence, "composing");
});

Deno.test("F41 send(PTT): presença recording (state composing + isAudio) e /send/media type=ptt", async () => {
  const { calls, fetcher } = recordingFetcher();
  const result = await send(
    { kind: "ptt", to: "5511999999999", instanceId: "inst-a", mediaUrl: "https://cdn/voz.ogg" },
    depsFor(fetcher),
  );

  // recording chega ao GO como composing + isAudio:true (evolution-go-routes)
  assertEquals(calls[0].body?.state, "composing");
  assertEquals(calls[0].body?.isAudio, true);
  assert(calls[1].url.endsWith("/send/media"));
  assertEquals(calls[1].body?.type, "ptt");
  assertEquals(calls[1].body?.url, "https://cdn/voz.ogg");
  assertEquals(result.presence, "recording");
});

Deno.test("F41 send recusa texto acima do limite sem tocar a rede", async () => {
  let touched = false;
  const fetcher: Fetcher = () => {
    touched = true;
    return Promise.resolve(okResponse());
  };
  const text = "a".repeat(capabilities().maxTextChars + 1);
  await assertRejects(
    () => send({ kind: "text", to: "5511999999999", instanceId: "inst-a", text }, depsFor(fetcher)),
    MessagingError,
  );
  assertEquals(touched, false);
});

Deno.test("F41 send propaga erro do provedor (ok=false, status e corpo preservados)", async () => {
  const { fetcher } = recordingFetcher(() =>
    new Response(JSON.stringify({ error: "number is not registered on WhatsApp" }), { status: 400 })
  );
  const result = await send(
    { kind: "text", to: "5511999999999", instanceId: "inst-a", text: "oi" },
    depsFor(fetcher),
  );
  assertEquals(result.ok, false);
  assertEquals(result.status, 400);
  assertEquals(result.messageId, undefined);
  assert(result.error, "erro deve ser reportado quando a resposta não confirma o envio");
});
