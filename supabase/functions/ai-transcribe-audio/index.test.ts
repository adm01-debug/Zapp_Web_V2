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
    throw new Error(
      `${msg}: esperava ${JSON.stringify(expected)}, veio ${
        JSON.stringify(actual)
      }`,
    );
  }
}

// ─── Fixtures reais: assinaturas mínimas que `detectMediaKind` reconhece ──────
// OGG/Opus (a voz do WhatsApp): "OggS".
const OGG_HEADER = new Uint8Array([
  0x4f,
  0x67,
  0x67,
  0x53,
  0x00,
  0x02,
  0x00,
  0x00,
]);
// Frame MPEG-1 Layer III (0xFF 0xFB ...).
const MP3_HEADER = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00]);
// ISO-BMFF/MP4: caixa `ftyp` no offset 4 com brand genérica (`mp42`). O detector
// classifica como `video/mp4`, mas no STT este container deve sair como M4A.
const MP4_FTYP_HEADER = new Uint8Array([
  0x00,
  0x00,
  0x00,
  0x18,
  0x66,
  0x74,
  0x79,
  0x70,
  0x6d,
  0x70,
  0x34,
  0x32,
  0x00,
  0x00,
  0x00,
  0x00,
  0x6d,
  0x70,
  0x34,
  0x32,
]);
// PNG real: magic bytes conhecidos, mas não são áudio. Deve cair no fallback do
// metadado de áudio em vez de virar `image/png` + `audio.bin`.
const PNG_HEADER = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
]);
// Nenhuma assinatura conhecida (0x99 não é texto imprimível).
const UNKNOWN_HEADER = new Uint8Array([0x99, 0x98, 0x97, 0x96]);

// `.mp3` de propósito: a extensão mente junto com o content-type.
const AUDIO_URL =
  "https://local.test/storage/v1/object/public/whatsapp-media/audio.mp3";

interface Captured {
  form: FormData | null;
}

/** `fetch` falso que captura o corpo enviado ao provedor e responde 200. */
function capturingFetch(
  captured: Captured,
  body: unknown = { text: "oi" },
): typeof fetch {
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

function baseDeps(
  overrides: Partial<TranscribeAudioDeps> = {},
): TranscribeAudioDeps {
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
    assertEquals(
      file.name,
      "audio.ogg",
      "o nome do arquivo deve seguir o tipo REAL",
    );
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
    assertEquals(
      file.type,
      "audio/mpeg",
      "o MPEG real deve vencer o audio/ogg informado",
    );
    assertEquals(
      file.name,
      "audio.mp3",
      "o nome do arquivo deve seguir o tipo REAL",
    );
  },
);

Deno.test(
  "SL-195a refazer: ftyp MP4 genérico vai ao STT como audio/mp4 + audio.m4a",
  async () => {
    const captured: Captured = { form: null };
    const deps = baseDeps({
      downloadAudio: () =>
        Promise.resolve({
          buffer: MP4_FTYP_HEADER.buffer as ArrayBuffer,
          contentType: "audio/ogg",
        }),
      fetch: capturingFetch(captured),
    });

    const res = await handleTranscribeAudio(makeRequest(), deps);
    assertEquals(res.status, 200, "o handler deveria concluir 200");

    assert(captured.form, "o fetch ao provedor não foi chamado");
    const file = captured.form.get("file") as File;
    assertEquals(
      file.type,
      "audio/mp4",
      "o container MP4 real deve vencer o metadado divergente",
    );
    assertEquals(
      file.name,
      "audio.m4a",
      "MP4 no STT deve usar extensão M4A, não bin",
    );
  },
);

Deno.test(
  "SL-195a refazer: magic bytes não-áudio caem no metadado de áudio sem audio.bin",
  async () => {
    const captured: Captured = { form: null };
    const deps = baseDeps({
      downloadAudio: () =>
        Promise.resolve({
          buffer: PNG_HEADER.buffer as ArrayBuffer,
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
      "PNG real não deve substituir o metadado de áudio",
    );
    assertEquals(
      file.name,
      "audio.webm",
      "fallback por metadado não pode gerar audio.bin",
    );

    const resolved = resolveTranscriptionAudioFormat(
      AUDIO_URL,
      "audio/webm",
      PNG_HEADER,
    );
    assertEquals(
      resolved.source,
      "metadata",
      "mime não-áudio deve cair no fallback do metadado",
    );
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
    assertEquals(
      file.name,
      "audio.webm",
      "a extensão acompanha o tipo declarado",
    );
  },
);

Deno.test("SL-195a: resolveTranscriptionAudioFormat marca a fonte da decisão", () => {
  const byMagic = resolveTranscriptionAudioFormat(
    "x.mp3",
    "audio/mpeg",
    OGG_HEADER,
  );
  assertEquals(byMagic.mimeType, "audio/ogg", "OGG real");
  assertEquals(byMagic.source, "magic", "decisão pelos magic bytes");

  const byMetadata = resolveTranscriptionAudioFormat(
    "audio.mp3",
    "audio/mpeg",
    UNKNOWN_HEADER,
  );
  assertEquals(byMetadata.mimeType, "audio/mpeg", "fallback pelo metadado");
  assertEquals(
    byMetadata.source,
    "metadata",
    "decisão pelo metadado declarado",
  );
});

// ─── Caminho NEGADO da autorização por objeto (IA-014) ────────────────────────
// O handler só classifica o tipo DEPOIS de autorizar; a injeção de `deps` não
// pode virar atalho que pula a autorização. Este teste roda o handler REAL no
// caminho de USUÁRIO e prova que a negação da visibilidade barra ANTES do
// download do objeto e ANTES de qualquer chamada ao provedor.
Deno.test(
  "IA-014: mensagem não visível é NEGADA e o objeto não é baixado nem vai ao provedor",
  async () => {
    let downloadCalled = false;
    let fetchCalled = false;
    const deps = baseDeps({
      authorize: () => Promise.resolve({ kind: "user", userId: "u-1" }),
      assertMessageVisible: () =>
        Promise.resolve({
          ok: false,
          status: 404,
          error: "Áudio não encontrado ou sem permissão",
        }),
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

    assertEquals(res.status, 404, "deve recusar com o status da autorização");
    assert(!downloadCalled, "o objeto não pode ser baixado antes de autorizar");
    assert(!fetchCalled, "a negação não pode chegar ao provedor de STT");
  },
);
