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

// ─── Caminho NEGADO: a ordem do contrato (visibilidade → download) ────────────
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


Deno.test(
  "IA-014: fonte de produção mantém chamada direta de visibilidade antes do download",
  async () => {
    let downloadCalled = false;
    const deps = baseDeps({
      authorize: () => Promise.resolve({ kind: "user", userId: "u-1" }),
      assertMessageVisible: () =>
        Promise.resolve({ ok: false, status: 403, error: "Áudio sem permissão" }),
      downloadAudio: () => {
        downloadCalled = true;
        return Promise.resolve({
          buffer: OGG_HEADER.buffer as ArrayBuffer,
          contentType: "audio/ogg",
        });
      },
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 403, "o handler real deve negar antes do download");
    assert(!downloadCalled, "o handler real não pode baixar antes de autorizar");

    const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
    const semImports = source.replace(/^import[\s\S]*?;\s*$/gm, "");
    const visibilidade = semImports.indexOf("await assertMessageVisibleToCaller(");
    const download = semImports.indexOf("await downloadAudio(");

    assert(visibilidade > -1, "produção deve chamar assertMessageVisibleToCaller diretamente");
    assert(download > -1, "produção deve chamar downloadAudio diretamente");
    assert(visibilidade < download, "produção deve autorizar a mensagem antes de baixar o objeto");
  },
);
