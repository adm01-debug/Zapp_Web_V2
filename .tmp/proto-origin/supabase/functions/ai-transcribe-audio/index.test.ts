/**
 * SL-195a (item 088 do SL-195) — contrato executável do `ai-transcribe-audio`.
 *
 * Defeito: o tipo enviado ao provedor de STT era escolhido pelo `content-type`
 * informado ou pela extensão da URL. Os dois são entradas NÃO confiáveis: um
 * arquivo OGG (`OggS`) servido com `audio/mpeg` e URL `.mp3` era enviado ao
 * provedor como MPEG — classificação frágil, que o cabeçalho REAL do arquivo
 * (magic bytes) deve vencer.
 *
 * O teste chama o handler REAL (`handleTranscribeAudio`) com um `Request` real e
 * confere o `FormData` que sai para o provedor (o tipo e o nome do arquivo). Roda
 * offline, sem rede, sem banco e sem env: tudo entra por `deps`.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/ai-transcribe-audio/index.test.ts
 */
import {
  decideAudioSizeRefusal,
  handleTranscribeAudio,
  resolveTranscriptionAudioFormat,
  type TranscribeAudioDeps,
} from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}: esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
  }
}

// ─── Fixtures reais: assinaturas mínimas que `detectMediaKind` reconhece ──────
// OGG/Opus (a voz do WhatsApp): "OggS".
const OGG_HEADER = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]);
// Frame MPEG-1 Layer III (0xFF 0xFB ...).
const MP3_HEADER = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00]);
// Nenhuma assinatura conhecida (0x99 não é texto imprimível).
const UNKNOWN_HEADER = new Uint8Array([0x99, 0x98, 0x97, 0x96]);
// ISO-BMFF com brand genérico ("isom"), como o áudio M4A do WhatsApp/iOS: o
// detector classifica como `video/mp4`.
const M4A_ISOM_HEADER = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // size + "ftyp"
  0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // "isom" + minor version
]);
// PNG: assinatura de arquivo que NÃO é áudio.
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

// `.mp3` de propósito: a extensão mente junto com o content-type.
const AUDIO_URL = "https://local.test/storage/v1/object/public/whatsapp-media/audio.mp3";

interface Captured {
  form: FormData | null;
}

/** `fetch` falso que captura o corpo enviado ao provedor e responde 200. */
function capturingFetch(captured: Captured, body: unknown = { text: "oi" }): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) => {
    captured.form = init?.body as FormData;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
}

function baseDeps(overrides: Partial<TranscribeAudioDeps> = {}): TranscribeAudioDeps {
  return {
    // Caminho de serviço: pula a checagem de visibilidade da mensagem (o objeto
    // baixado também é injetado), deixando o teste focado no tipo do arquivo.
    authorize: () => Promise.resolve({ kind: "service", userId: null }),
    rateLimit: () => ({ allowed: true }),
    clientIp: "127.0.0.1",
    env: (key) => (key === "ELEVENLABS_API_KEY" ? "test-key" : undefined),
    ...overrides,
  };
}

function makeRequest(): Request {
  return new Request("https://edge.test/ai-transcribe-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioUrl: AUDIO_URL, messageId: "msg-1" }),
  });
}

Deno.test(
  "SL-195a: magic bytes vencem metadado divergente — OGG servido como audio/mpeg vai como audio/ogg",
  async () => {
    const captured: Captured = { form: null };
    const deps = baseDeps({
      downloadAudio: () =>
        Promise.resolve({
          buffer: OGG_HEADER.buffer as ArrayBuffer,
          contentType: "audio/mpeg",
        }),
      fetch: capturingFetch(captured),
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 200, "o handler deveria concluir 200");

    assert(captured.form, "o fetch ao provedor não foi chamado");
    const file = captured.form.get("file") as File;
    assertEquals(
      file.type,
      "audio/ogg",
      "o tipo enviado deve vir dos magic bytes, não do audio/mpeg informado",
    );
    assertEquals(file.name, "audio.ogg", "o nome do arquivo deve seguir o tipo REAL");
  },
);

Deno.test(
  "SL-195a: magic bytes vencem metadado divergente — MPEG servido como audio/ogg vai como audio/mpeg",
  async () => {
    const captured: Captured = { form: null };
    const deps = baseDeps({
      downloadAudio: () =>
        Promise.resolve({
          buffer: MP3_HEADER.buffer as ArrayBuffer,
          contentType: "audio/ogg",
        }),
      fetch: capturingFetch(captured),
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 200, "o handler deveria concluir 200");

    assert(captured.form, "o fetch ao provedor não foi chamado");
    const file = captured.form.get("file") as File;
    assertEquals(file.type, "audio/mpeg", "o MPEG real deve vencer o audio/ogg informado");
    assertEquals(file.name, "audio.mp3", "o nome do arquivo deve seguir o tipo REAL");
  },
);

Deno.test(
  "SL-195a: assinatura não reconhecida mantém o fallback do metadado declarado (não regride)",
  async () => {
    const captured: Captured = { form: null };
    const deps = baseDeps({
      downloadAudio: () =>
        Promise.resolve({
          buffer: UNKNOWN_HEADER.buffer as ArrayBuffer,
          contentType: "audio/webm",
        }),
      fetch: capturingFetch(captured),
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 200, "o handler deveria concluir 200");

    assert(captured.form, "o fetch ao provedor não foi chamado");
    const file = captured.form.get("file") as File;
    assertEquals(
      file.type,
      "audio/webm",
      "sem magic bytes reconhecíveis o content-type declarado ainda decide",
    );
    assertEquals(file.name, "audio.webm", "a extensão acompanha o tipo declarado");
  },
);

Deno.test("SL-195a: resolveTranscriptionAudioFormat marca a fonte da decisão", () => {
  const byMagic = resolveTranscriptionAudioFormat("x.mp3", "audio/mpeg", OGG_HEADER);
  assertEquals(byMagic.mimeType, "audio/ogg", "OGG real");
  assertEquals(byMagic.source, "magic", "decisão pelos magic bytes");

  const byMetadata = resolveTranscriptionAudioFormat(
    "audio.mp3",
    "audio/mpeg",
    UNKNOWN_HEADER,
  );
  assertEquals(byMetadata.mimeType, "audio/mpeg", "fallback pelo metadado");
  assertEquals(byMetadata.source, "metadata", "decisão pelo metadado declarado");
});

Deno.test(
  "SL-195a: M4A em container ftyp (detectado como video/mp4) vai como audio/mp4 + audio.m4a",
  async () => {
    const captured: Captured = { form: null };
    const deps = baseDeps({
      downloadAudio: () =>
        Promise.resolve({
          buffer: M4A_ISOM_HEADER.buffer as ArrayBuffer,
          contentType: "audio/ogg",
        }),
      fetch: capturingFetch(captured),
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 200, "o handler deveria concluir 200");

    assert(captured.form, "o fetch ao provedor não foi chamado");
    const file = captured.form.get("file") as File;
    assertEquals(file.type, "audio/mp4", "o container MP4 de áudio deve ir como audio/mp4");
    assertEquals(file.name, "audio.m4a", "o nome do arquivo deve ser .m4a, nunca .bin");

    const format = resolveTranscriptionAudioFormat("audio.mp3", "audio/ogg", M4A_ISOM_HEADER);
    assertEquals(format.source, "magic", "a decisão vem dos magic bytes");
  },
);

Deno.test(
  "SL-195a: assinatura que não é áudio (PNG) com metadado de áudio cai no metadado, sem .bin",
  async () => {
    const captured: Captured = { form: null };
    const deps = baseDeps({
      downloadAudio: () =>
        Promise.resolve({
          buffer: PNG_HEADER.buffer as ArrayBuffer,
          contentType: "audio/ogg",
        }),
      fetch: capturingFetch(captured),
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 200, "o handler deveria concluir 200");

    assert(captured.form, "o fetch ao provedor não foi chamado");
    const file = captured.form.get("file") as File;
    assertEquals(file.type, "audio/ogg", "mime não-áudio não pode ir ao STT: vale o metadado");
    assertEquals(file.name, "audio.ogg", "o nome segue o metadado, nunca audio.bin");

    const format = resolveTranscriptionAudioFormat("audio.mp3", "audio/ogg", PNG_HEADER);
    assertEquals(format.source, "metadata", "a decisão cai no metadado declarado");
    assert(!format.fileName.endsWith(".bin"), "nunca gerar audio.bin");
  },
);

// ─── Servidor é a única fonte: grava o ESTADO e reusa (idempotência) ─────────
interface WriteCall {
  messageId: string;
  write: { transcription?: string | null; status: string };
}

interface StoreCapture {
  writes: WriteCall[];
  loads: string[];
}

/** Store injetado: captura as gravações e devolve o estado existente. */
function stubStore(
  capture: StoreCapture,
  existing: { transcription: string | null; status: string | null } | null = null,
): Pick<TranscribeAudioDeps, "loadTranscription" | "saveTranscription"> {
  return {
    loadTranscription: (messageId: string) => {
      capture.loads.push(messageId);
      return Promise.resolve(existing);
    },
    saveTranscription: (messageId: string, write) => {
      capture.writes.push({ messageId, write });
      return Promise.resolve(true);
    },
  };
}

Deno.test(
  "SL-195b: o SERVIDOR grava o estado (processing → completed) com o texto devolvido",
  async () => {
    const capture: StoreCapture = { writes: [], loads: [] };
    const deps = baseDeps({
      ...stubStore(capture),
      downloadAudio: () =>
        Promise.resolve({ buffer: OGG_HEADER.buffer as ArrayBuffer, contentType: "audio/ogg" }),
      fetch: capturingFetch({ form: null }, { text: "olá, tudo bem?" }),
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 200, "o handler deveria concluir 200");

    const body = await res.json() as { transcription?: string };
    assertEquals(body.transcription, "olá, tudo bem?", "a resposta devolve o TEXTO");

    assertEquals(capture.loads.length, 1, "o handler consulta o estado atual antes de pagar");
    assertEquals(capture.writes.length, 2, "grava processing e completed");
    assertEquals(capture.writes[0].write.status, "processing", "marca processing antes do provedor");
    assertEquals(capture.writes[0].messageId, "msg-1", "grava na mensagem do pedido");
    assertEquals(capture.writes[1].write.status, "completed", "marca completed no fim");
    assertEquals(capture.writes[1].write.transcription, "olá, tudo bem?", "grava o texto do provedor");
  },
);

Deno.test(
  "SL-195b: re-execução reusa a transcrição gravada — NÃO chama o provedor de novo (não duplica custo)",
  async () => {
    const capture: StoreCapture = { writes: [], loads: [] };
    let fetchCalled = false;
    const deps = baseDeps({
      ...stubStore(capture, { transcription: "já transcrito antes", status: "completed" }),
      downloadAudio: () =>
        Promise.resolve({ buffer: OGG_HEADER.buffer as ArrayBuffer, contentType: "audio/ogg" }),
      fetch: ((_input: RequestInfo | URL) => {
        fetchCalled = true;
        return Promise.resolve(new Response("{}", { status: 200 }));
      }) as typeof fetch,
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 200, "o handler reusa sem erro");

    const body = await res.json() as { transcription?: string; reused?: boolean };
    assertEquals(body.transcription, "já transcrito antes", "devolve o texto já gravado");
    assertEquals(body.reused, true, "sinaliza que reusou");
    assert(!fetchCalled, "o provedor de STT NÃO pode ser pago de novo");
    assertEquals(capture.writes.length, 0, "reuso não reescreve o estado");
  },
);

Deno.test(
  "SL-195b: falha do provedor grava transcription_status = failed (não deixa preso em processing)",
  async () => {
    const capture: StoreCapture = { writes: [], loads: [] };
    const deps = baseDeps({
      ...stubStore(capture),
      downloadAudio: () =>
        Promise.resolve({ buffer: OGG_HEADER.buffer as ArrayBuffer, contentType: "audio/ogg" }),
      fetch: (() =>
        Promise.resolve(new Response("boom", { status: 500 }))) as typeof fetch,
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 500, "erro do provedor vira 500");

    const statuses = capture.writes.map((w) => w.write.status);
    assertEquals(statuses[statuses.length - 1], "failed", "o último estado gravado é failed");
    assert(!statuses.includes("completed"), "não grava completed numa falha");
  },
);

Deno.test(
  "SL-195b: 400 do provedor (formato inválido) também grava failed",
  async () => {
    const capture: StoreCapture = { writes: [], loads: [] };
    const deps = baseDeps({
      ...stubStore(capture),
      downloadAudio: () =>
        Promise.resolve({ buffer: OGG_HEADER.buffer as ArrayBuffer, contentType: "audio/ogg" }),
      fetch: (() =>
        Promise.resolve(new Response("bad", { status: 400 }))) as typeof fetch,
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 200, "o fallback de formato responde 200 com aviso");

    const body = await res.json() as { fallback?: boolean };
    assertEquals(body.fallback, true, "devolve o fallback INVALID_AUDIO");
    assertEquals(
      capture.writes[capture.writes.length - 1].write.status,
      "failed",
      "formato inválido é um estado failed",
    );
  },
);

Deno.test(
  "IA-014: no caminho de usuário, mensagem não visível é NEGADA e o objeto NÃO é baixado",
  async () => {
    let downloadCalled = false;
    let fetchCalled = false;
    const deps = baseDeps({
      authorize: () => Promise.resolve({ kind: "user", userId: "u-1" }),
      // Simula o `assertMessageVisibleToCaller` real recusando: a mensagem não
      // existe/não é visível para o chamador.
      assertMessageVisible: () =>
        Promise.resolve({ ok: false, status: 404, error: "Áudio não encontrado ou sem permissão" }),
      downloadAudio: () => {
        downloadCalled = true;
        return Promise.resolve({
          buffer: OGG_HEADER.buffer as ArrayBuffer,
          contentType: "audio/ogg",
        });
      },
      fetch: ((_input: RequestInfo | URL) => {
        fetchCalled = true;
        return Promise.resolve(new Response("{}", { status: 200 }));
      }) as typeof fetch,
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);

    assertEquals(res.status, 404, "mensagem não visível deve ser recusada com o status da autz");
    assert(!downloadCalled, "o objeto não pode ser baixado antes de autorizar (IA-014)");
    assert(!fetchCalled, "nada pode ir ao provedor quando a autorização nega");
  },
);

// ─── G1: o teto por IP do painel não pode estrangular o caminho de SERVIÇO ─────
// O webhook do WhatsApp chama esta Edge com a service role key e TODAS as
// chamadas chegam do MESMO IP (o do worker). O teto de 10/min por IP era
// aplicado ao serviço também: a partir da 11ª transcrição do minuto o webhook
// recebia 429 e a mensagem ficava `failed` — com o áudio já pago no provedor.
// Quem limita o serviço é o `servicePerMinute` (60/min) de `requireAiIdentityOrService`.

Deno.test(
  "G1: 15 transcrições de SERVIÇO no mesmo minuto concluem 200 (sem teto por IP no serviço)",
  async () => {
    let rateLimitCalls = 0;
    const statuses: number[] = [];

    for (let i = 0; i < 15; i++) {
      const capture: StoreCapture = { writes: [], loads: [] };
      const deps = baseDeps({
        ...stubStore(capture),
        // Se o caminho de serviço ainda passasse por aqui, a PRIMEIRA chamada
        // receberia 429 (o falso nega sempre) — é o que prova a remoção.
        rateLimit: () => {
          rateLimitCalls += 1;
          return { allowed: false };
        },
        downloadAudio: () =>
          Promise.resolve({ buffer: OGG_HEADER.buffer as ArrayBuffer, contentType: "audio/ogg" }),
        fetch: capturingFetch({ form: null }, { text: `transcricao-${i}` }),
      });

      const res = await handleTranscribeAudio(makeRequest(), deps);
      statuses.push(res.status);
    }

    assertEquals(
      statuses.every((s) => s === 200),
      true,
      `as 15 chamadas de serviço deveriam concluir 200; vieram ${statuses.join(",")}`,
    );
    assertEquals(rateLimitCalls, 0, "o teto por IP do painel não é consultado no caminho de serviço");
  },
);

Deno.test(
  "G1: o caminho de USUÁRIO continua recebendo 429 acima do teto por IP",
  async () => {
    let rateLimitCalls = 0;
    const deps = baseDeps({
      authorize: () => Promise.resolve({ kind: "user", userId: "u-1" }),
      rateLimit: () => {
        rateLimitCalls += 1;
        return { allowed: false };
      },
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);

    assertEquals(res.status, 429, "usuário acima do teto por IP recebe 429");
    assertEquals(rateLimitCalls, 1, "o teto por IP do painel continua valendo para o usuário");
  },
);

// ─── G4: ledger de consumo, timeouts e 500 sem detalhe interno ───────────────
const G4_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ELEVENLABS_API_KEY",
] as const;

interface G4Call {
  url: string;
  init?: RequestInit;
}

/**
 * Stuba o `fetch` GLOBAL: é por ele que o supabase-js (dentro de
 * `logAiUsageDetached`) faz o POST no ledger. O STT continua entrando por
 * `deps.fetch`, então os dois caminhos não se confundem.
 */
function withGlobalFetch(
  make: (url: string) => Response,
): { calls: G4Call[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: G4Call[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    calls.push({ url, init });
    return Promise.resolve(make(url));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

async function withG4Env(fn: () => Promise<void>): Promise<void> {
  const saved = G4_ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key-de-teste");
  Deno.env.set("ELEVENLABS_API_KEY", "xi-key-de-teste");
  try {
    await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test(
  "G4: STT 200 registra o consumo pago no ledger com usage_unknown",
  async () => {
    const stub = withGlobalFetch(() =>
      Response.json({ status: "ok" }, { status: 200 })
    );
    try {
      await withG4Env(async () => {
        const deps = baseDeps({
          downloadAudio: () =>
            Promise.resolve({
              buffer: OGG_HEADER.buffer as ArrayBuffer,
              contentType: "audio/ogg",
            }),
          fetch: (() =>
            Promise.resolve(
              Response.json({ text: "olá mundo" }, { status: 200 }),
            )) as typeof fetch,
        });

        const res = await handleTranscribeAudio(makeRequest(), deps);

        assertEquals(res.status, 200, "o STT stubado deveria concluir 200");
        const ledger = stub.calls.filter((c) =>
          c.url.includes("/rest/v1/ai_usage_logs")
        );
        assertEquals(
          ledger.length,
          1,
          "uma linha de consumo por chamada paga (nem zero, nem duas)",
        );
        const row = JSON.parse(
          (ledger[0].init?.body as string) ?? "{}",
        ) as Record<string, unknown>;
        const meta = row["metadata"] as Record<string, unknown>;
        assertEquals(
          meta["usage_unknown"],
          true,
          "o provedor não devolve a quantidade: ausência NÃO é zero",
        );
        assertEquals(
          meta["billing_unit"],
          "second",
          "a rota /v1/speech-to-text fatura por segundo",
        );
      });
    } finally {
      stub.restore();
    }
  },
);

Deno.test(
  "G4: fetch pendurado ao STT estoura o timeout e devolve 504 em pt-BR (e registra o consumo da tentativa)",
  async () => {
    const stub = withGlobalFetch(() =>
      Response.json({ status: "ok" }, { status: 200 })
    );
    try {
      await withG4Env(async () => {
        // `fetch` que PRENDE a promessa: ignora o `signal` do `init` de
        // propósito — é o `abortable` que garante o 504, não o abort nativo.
        const hangingFetch = (() =>
          new Promise<Response>(() => {})) as typeof fetch;
        const deps = baseDeps({
          downloadAudio: () =>
            Promise.resolve({
              buffer: OGG_HEADER.buffer as ArrayBuffer,
              contentType: "audio/ogg",
            }),
          fetch: hangingFetch,
          saveTranscription: () => Promise.resolve(true),
          sttTimeoutMs: 25,
        });

        const res = await handleTranscribeAudio(makeRequest(), deps);

        assertEquals(res.status, 504, "provedor pendurado vira 504 em vez de travar o handler");
        const body = await res.json() as Record<string, unknown>;
        assertEquals(
          body["error"],
          "O provedor de transcrição demorou demais para responder",
          "o corpo do 504 sai em pt-BR (não 'Internal server error')",
        );
        const ledger = stub.calls.filter((c) =>
          c.url.includes("/rest/v1/ai_usage_logs")
        );
        assertEquals(
          ledger.length,
          1,
          "a tentativa abortada também deixa linha no ledger (pode ter sido cobrada)",
        );
        const row = JSON.parse(
          (ledger[0].init?.body as string) ?? "{}",
        ) as Record<string, unknown>;
        assertEquals(
          row["error_message"],
          "provider_timeout",
          "a linha do timeout carrega o motivo próprio, não o detalhe do fetch",
        );
      });
    } finally {
      stub.restore();
    }
  },
);

Deno.test(
  "G4: 500 de exceção devolve texto fixo em pt-BR, sem vazar o detalhe interno",
  async () => {
    const deps = baseDeps({
      downloadAudio: () =>
        Promise.resolve({
          buffer: OGG_HEADER.buffer as ArrayBuffer,
          contentType: "audio/ogg",
        }),
      fetch: (() =>
        Promise.resolve(
          Response.json({ text: "tanto faz" }, { status: 200 }),
        )) as typeof fetch,
      loadTranscription: () => {
        throw new Error("segredo-interno-do-banco");
      },
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);

    assertEquals(res.status, 500, "exceção inesperada continua 500");
    const body = await res.json() as Record<string, unknown>;
    assertEquals(
      body["error"],
      "Erro interno ao transcrever o áudio",
      "o cliente recebe texto fixo em pt-BR",
    );
    assert(
      !JSON.stringify(body).includes("segredo-interno-do-banco"),
      "o detalhe interno não pode vazar no corpo",
    );
  },
);

Deno.test(
  "Refazer t_eeac9ac7: erro de download com status 504 chega ao cliente como 504 em pt-BR",
  async () => {
    const deps = baseDeps({
      downloadAudio: () =>
        Promise.resolve({
          error: "Tempo esgotado ao baixar o áudio",
          status: 504,
        }),
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);

    assertEquals(res.status, 504, "o status do download é propagado, não vira 400");
    const body = await res.json() as Record<string, unknown>;
    assertEquals(
      body["error"],
      "Tempo esgotado ao baixar o áudio",
      "o corpo do 504 do download sai em pt-BR (não 'Internal server error')",
    );
  },
);

Deno.test("Refazer t_eeac9ac7: decideAudioSizeRefusal — decisão de tamanho por metadado", () => {
  assertEquals(
    decideAudioSizeRefusal(null),
    null,
    "sem metadado, segue para o download (a checagem pós-download continua valendo)",
  );
  assertEquals(
    decideAudioSizeRefusal(25 * 1024 * 1024),
    null,
    "no limite exato, não recusa",
  );
  assertEquals(
    decideAudioSizeRefusal(25 * 1024 * 1024 + 1)?.error,
    "Arquivo de áudio grande demais (máximo 25 MB)",
    "acima do limite, recusa em pt-BR antes de baixar",
  );
  assertEquals(
    decideAudioSizeRefusal(25 * 1024 * 1024 + 1)?.status,
    413,
    "a recusa por metadado sai com 413",
  );
});
