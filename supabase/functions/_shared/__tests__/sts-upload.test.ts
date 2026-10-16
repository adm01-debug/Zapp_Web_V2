// G3: o validador de upload das conversões pagas de áudio vive em
// `_shared/sts-upload.ts` e é o MESMO código para `elevenlabs-sts` e `voice-changer`
// (antes cada Edge tinha a sua cópia/nenhuma). Prova de unidade das duas fronteiras —
// `content-length` antes de ler o corpo e `size` real + assinatura do container — com o
// teto vindo por parâmetro, que é o que permite cada rota ter o seu número.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//     supabase/functions/_shared/__tests__/sts-upload.test.ts

import {
  announcedAudioTooLarge,
  MAX_STS_AUDIO_BYTES,
  MAX_VOICE_CHANGER_AUDIO_BYTES,
  sniffStsAudioFormat,
  validateStsUpload,
} from "../sts-upload.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function bytesComHead(head: number[], size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  bytes.set(head, 0);
  return bytes;
}

/** `File` de mentira para o teto, sem alocar MiBs: só `size` e `slice().arrayBuffer()`. */
function fakeFile(size: number): File {
  return {
    size,
    slice: () => ({
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  } as unknown as File;
}

function pedido(contentLength?: string): Request {
  const headers: Record<string, string> = {};
  if (contentLength !== undefined) headers["content-length"] = contentLength;
  return new Request("https://stub.supabase.co/functions/v1/x", { method: "POST", headers });
}

Deno.test("G3: sniff reconhece os containers do produto e recusa o que não é áudio", () => {
  assert(sniffStsAudioFormat(bytesComHead([0x4f, 0x67, 0x67, 0x53])) === "ogg", "OggS é ogg");
  // RIFF + "WAVE" no offset 8: o container precisa dizer que é onda, não só RIFF.
  assert(
    sniffStsAudioFormat(bytesComHead([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])) === "wav",
    "RIFF/WAVE é wav",
  );
  assert(
    sniffStsAudioFormat(bytesComHead([0x52, 0x49, 0x46, 0x46])) === null,
    "RIFF sem WAVE não pode passar como áudio",
  );
  assert(
    sniffStsAudioFormat(bytesComHead([0x49, 0x44, 0x33])) === "mp3",
    "ID3 é mp3",
  );
  assert(
    sniffStsAudioFormat(bytesComHead([0x1a, 0x45, 0xdf, 0xa3])) === "webm",
    "EBML é webm",
  );
  assert(
    sniffStsAudioFormat(bytesComHead([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41])) ===
      "m4a",
    "ftypM4A é m4a",
  );
  assert(
    sniffStsAudioFormat(new TextEncoder().encode("isto e um roteiro, nao um audio")) === null,
    "texto não pode passar como áudio",
  );
});

Deno.test("G3: vazio -> 400; áudio de verdade -> aceito", async () => {
  const vazio = await validateStsUpload(new File([], "audio.ogg", { type: "audio/ogg" }));
  assert(vazio !== null && vazio.status === 400, `esperado 400, veio ${JSON.stringify(vazio)}`);

  const ok = await validateStsUpload(
    new File([bytesComHead([0x4f, 0x67, 0x67, 0x53])], "audio.ogg", { type: "audio/ogg" }),
  );
  assert(ok === null, `áudio válido não pode ser recusado: ${JSON.stringify(ok)}`);
});

Deno.test("G3: acima do teto -> 413 citando o teto RECEBIDO por parâmetro", async () => {
  const doVoiceChanger = await validateStsUpload(
    fakeFile(MAX_VOICE_CHANGER_AUDIO_BYTES + 1),
    MAX_VOICE_CHANGER_AUDIO_BYTES,
  );
  assert(
    doVoiceChanger !== null && doVoiceChanger.status === 413,
    `esperado 413 no teto do voice-changer, veio ${JSON.stringify(doVoiceChanger)}`,
  );
  assert(
    doVoiceChanger.error.includes(String(MAX_VOICE_CHANGER_AUDIO_BYTES)),
    `a recusa tem de citar o teto recebido: ${doVoiceChanger.error}`,
  );

  // O teto padrão é o do caminho de STT/STS (25 MiB) — o `voice-changer` passa o dele.
  const noPadrao = await validateStsUpload(fakeFile(MAX_STS_AUDIO_BYTES + 1));
  assert(
    noPadrao !== null && noPadrao.status === 413,
    `esperado 413 no teto padrão, veio ${JSON.stringify(noPadrao)}`,
  );
  // Um arquivo entre os dois tetos passa no teto padrão de 25 MiB (e é recusado no de
  // 10 MiB): o `maxBytes` é mesmo por chamador.
  const entreOsTeto = fakeFile(MAX_VOICE_CHANGER_AUDIO_BYTES + 1);
  const noTetoPadrao = await validateStsUpload(entreOsTeto);
  assert(
    noTetoPadrao === null || noTetoPadrao.status !== 413,
    `o teto padrão (25 MiB) não pode recusar 10 MiB + 1 byte por TAMANHO: ${JSON.stringify(noTetoPadrao)}`,
  );
});

Deno.test("G3: content-length anunciado é recusado ANTES de ler o corpo", () => {
  assert(announcedAudioTooLarge(pedido(), MAX_STS_AUDIO_BYTES) === false, "sem cabeçalho não recusa");
  assert(
    announcedAudioTooLarge(pedido(String(MAX_STS_AUDIO_BYTES)), MAX_STS_AUDIO_BYTES) === false,
    "no limite exato não recusa",
  );
  assert(
    announcedAudioTooLarge(pedido(String(MAX_STS_AUDIO_BYTES + 1)), MAX_STS_AUDIO_BYTES) === true,
    "um byte acima do teto recusa",
  );
  assert(
    announcedAudioTooLarge(pedido(String(MAX_VOICE_CHANGER_AUDIO_BYTES + 1)), MAX_VOICE_CHANGER_AUDIO_BYTES) === true,
    "o teto do voice-changer vale com o parâmetro dele",
  );
  assert(
    announcedAudioTooLarge(pedido("nao-e-numero"), MAX_STS_AUDIO_BYTES) === false,
    "cabeçalho inválido não pode derrubar o handler (o size real decide depois)",
  );
});

Deno.test("G3: o teto do voice-changer é o de 10 MiB e o do STS/STT é o de 25 MiB", () => {
  assert(MAX_VOICE_CHANGER_AUDIO_BYTES === 10 * 1024 * 1024, "voice-changer: 10 MiB");
  assert(MAX_STS_AUDIO_BYTES === 25 * 1024 * 1024, "STS/STT: 25 MiB");
});
