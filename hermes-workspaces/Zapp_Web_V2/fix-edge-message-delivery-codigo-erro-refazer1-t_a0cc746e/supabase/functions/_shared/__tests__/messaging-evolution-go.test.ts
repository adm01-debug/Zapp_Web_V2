// F41 — adaptador único de envio pelo Evolution GO.
// Prova que `send()` monta o payload v2 correto por tipo (texto/imagem/documento/
// áudio/PTT), aplica a presença composing/recording conforme o tipo e usa o
// `evolution-go-routes.ts` (rota GO final), tudo com fetch injetado — sem rede.

import { assertEquals, assert, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { capabilities, send, presenceForKind, MessagingError, PRESENCE_TIMEOUT_MS } from "../messaging/evolution-go.ts";
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

// ── MX07: credencial da rota — instância exige o token DELA, nunca a key global ──

Deno.test("MX07 send sem instanceToken em rota auth=instance rejeita fechado (sem rede, sem key global)", async () => {
  let touched = false;
  const fetcher: Fetcher = () => {
    touched = true;
    return Promise.resolve(okResponse());
  };
  const err = await assertRejects(
    () =>
      send(
        { kind: "text", to: "5511999999999", instanceId: "inst-a", text: "oi" },
        { fetch: fetcher, evolutionUrl: "https://go.exemplo.com", evolutionKey: "admin-key", flavor: "go" },
      ),
    MessagingError,
  );
  assertEquals(err.code, "missing_instance_token");
  assertEquals(touched, false, "nenhum POST (nem presença) pode sair sem a credencial da instância");
});

Deno.test("MX07 send usa o token da instância escolhida em TODA chamada (duas instâncias, sem fallback)", async () => {
  const { calls, fetcher } = recordingFetcher();
  const base = {
    fetch: fetcher,
    evolutionUrl: "https://go.exemplo.com",
    evolutionKey: "admin-key",
    flavor: "go" as const,
  };

  await send(
    { kind: "text", to: "5511999999999", instanceId: "inst-a", text: "oi" },
    { ...base, instanceToken: "token-inst-a" },
  );
  await send(
    { kind: "text", to: "5511888888888", instanceId: "inst-b", text: "oi" },
    { ...base, instanceToken: "token-inst-b" },
  );

  assertEquals(calls.length, 4, "2 envios = 2 presenças + 2 mensagens");
  // Presença e envio usam a MESMA identidade: o token da instância daquele envio.
  assertEquals(
    calls.map((c) => c.apikey),
    ["token-inst-a", "token-inst-a", "token-inst-b", "token-inst-b"],
  );
  assert(
    calls.every((c) => c.apikey !== "admin-key"),
    "a key global nunca pode sair no header apikey de uma rota de instância",
  );
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

// ── R2-API-031 / item 205 (P2): a presença NÃO pode segurar o envio além do prazo do chamador ──
//
// Defeito: `send` aguardava `postPresence` antes do POST da mensagem, e a presença
// não recebia `deps.signal` nem tinha prazo próprio. Com o endpoint de presença
// pendurado, o envio ficava parado além do `AbortSignal` do chamador — e o item
// terminava em outcome_unknown sem nunca ter chegado ao POST da mensagem.

const textoItem: SendItem = { kind: "text", to: "5511999999999", instanceId: "inst-a", text: "oi" };

/**
 * Fetcher em que a presença fica PENDURADA e a mensagem responde OK. Como um
 * `fetch` de verdade, a presença só encerra quando o `signal` repassado a ela
 * dispara; SEM sinal (o caminho do defeito) ela nunca resolve — é o que prova
 * que o sinal do chamador chega ao POST da presença.
 */
function hangingPresenceFetcher() {
  const seen = { presence: 0, message: 0, presenceSignal: null as AbortSignal | null };
  const fetcher: Fetcher = (url, options) => {
    if (url.includes("/message/presence")) {
      seen.presence += 1;
      const s = options.signal ?? null;
      seen.presenceSignal = s;
      if (!s) return new Promise<Response>(() => {});
      return new Promise<Response>((_, reject) => {
        if (s.aborted) return reject(new Error("aborted"));
        s.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    }
    seen.message += 1;
    return Promise.resolve(okResponse());
  };
  return { seen, fetcher };
}

/** Espera a promessa no máximo `ms`; nunca rejeita (devolve o veredito), sem deixar timer solto. */
async function settleOrPending<T>(
  p: Promise<T>,
  ms: number,
): Promise<{ status: "ok"; value: T } | { status: "err"; error: unknown } | { status: "pending" }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.then((value) => ({ status: "ok" as const, value }), (error) => ({ status: "err" as const, error })),
      new Promise<{ status: "pending" }>((resolve) => {
        timer = setTimeout(() => resolve({ status: "pending" }), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

Deno.test("P2 #205 presença pendente: o sinal do chamador encerra a espera e a mensagem não sai depois do cancelamento", async () => {
  const ctrl = new AbortController();
  const { seen, fetcher } = hangingPresenceFetcher();
  // Orçamento da presença folgado de propósito: quem cancela aqui é o SINAL do chamador.
  const envio = send(textoItem, { ...depsFor(fetcher), signal: ctrl.signal, presenceTimeoutMs: 5_000 });
  // O chamador estoura o prazo (o mesmo que o AbortController de 20 s das edges faz).
  setTimeout(() => ctrl.abort(), 20);

  const veredito = await settleOrPending(envio, 500);

  assert(
    veredito.status !== "pending",
    "a presença pendente segurou o envio além do prazo do chamador — send() nunca terminou",
  );
  assertEquals(veredito.status, "err");
  if (veredito.status === "err") {
    assertEquals((veredito.error as Error).name, "AbortError", "o cancelamento tem de sair como AbortError");
  }
  assertEquals(seen.presence, 1);
  assert(seen.presenceSignal !== null, "o sinal do chamador tem de ser repassado ao POST da presença");
  assertEquals(seen.message, 0, "não pode haver POST de mensagem depois do cancelamento");
});

Deno.test("P2 #205 presença pendurada e sem prazo do chamador: o teto curto da etapa deixa o envio autorizado seguir", async () => {
  const { seen, fetcher } = hangingPresenceFetcher();
  // Endpoint que ignora o cancelamento: só o prazo CURTO da presença encerra a etapa.
  const envio = send(textoItem, { ...depsFor(fetcher), presenceTimeoutMs: 25 });

  const veredito = await settleOrPending(envio, 1_000);

  assert(veredito.status !== "pending", "sem teto, a presença pendurada segurou o envio");
  assertEquals(veredito.status, "ok");
  if (veredito.status === "ok") {
    assertEquals(veredito.value.ok, true, "falha/pendência da presença não pode impedir um envio autorizado");
  }
  assertEquals(seen.presence, 1);
  assertEquals(seen.message, 1, "o POST da mensagem tem de acontecer depois do teto curto da presença");
});

Deno.test("P2 #205 sinal já abortado não inicia efeito nenhum (nem presença, nem mensagem)", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const { calls, fetcher } = recordingFetcher();

  let lancado: unknown;
  try {
    await send(textoItem, { ...depsFor(fetcher), signal: ctrl.signal });
  } catch (e) {
    lancado = e;
  }

  assert(lancado instanceof Error, "sinal já abortado tem de encerrar o envio, não resolvê-lo");
  assertEquals((lancado as Error).name, "AbortError");
  assertEquals(calls.length, 0, "nada pode ser enviado com o sinal já abortado");
});

Deno.test("P2 #205 sem override, o teto PADRÃO da presença deixa o envio seguir (não pendura)", async () => {
  const { seen, fetcher } = hangingPresenceFetcher();
  // Sem `presenceTimeoutMs`: exercita o PRESENCE_TIMEOUT_MS de produção pelo caminho real.
  const veredito = await settleOrPending(send(textoItem, depsFor(fetcher)), 4_000);

  assert(
    veredito.status !== "pending",
    `com o teto padrão (${PRESENCE_TIMEOUT_MS} ms) a presença pendurada segurou o envio`,
  );
  assertEquals(veredito.status, "ok");
  if (veredito.status === "ok") {
    assertEquals(veredito.value.ok, true, "o envio autorizado tem de sair com o teto padrão da presença");
  }
  assertEquals(seen.message, 1, "o POST da mensagem tem de acontecer depois do teto padrão da presença");
});
