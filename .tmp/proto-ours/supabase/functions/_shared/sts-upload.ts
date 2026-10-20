/**
 * Validação COMPARTILHADA do upload de áudio das conversões pagas do ElevenLabs
 * (`elevenlabs-sts` e `voice-changer`).
 *
 * Achado 24 do mapa de paridade (G3): o `voice-changer` lia o corpo inteiro
 * (`req.formData()`) antes de qualquer recusa, não conferia o conteúdo — um blob
 * que só DIZIA ser áudio ia ao provedor pago — e usava um teto menor que o da Edge
 * irmã. Aqui a regra fica em UM lugar só; as duas funções recusam ANTES de gastar
 * o provedor.
 *
 * A recusa acontece em duas fronteiras:
 *  1. no `content-length` (`announcedAudioTooLarge`), ANTES de `req.formData()` —
 *     o corpo abusivo nunca é materializado na memória;
 *  2. no `size` real do `File` e na ASSINATURA do container (magic bytes) — o
 *     `File.type` vem do cliente e pode mentir, então o tipo é provado nos bytes.
 */

/** Teto do `elevenlabs-sts` (mesmo número do caminho de STT, `ai-transcribe-audio`). */
export const MAX_STS_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Teto do `voice-changer`: 10 MiB — o MESMO número que a função já aplicava antes
 * desta mudança. Decisão registrada (G3): endurecer não é afrouxar; o teto que já
 * valia fica, só troca o `File.size` tardio pela checagem de `content-length`
 * antes de ler o corpo e pela assinatura dos bytes.
 */
export const MAX_VOICE_CHANGER_AUDIO_BYTES = 10 * 1024 * 1024;

/** Containers que o app envia (gravador webm/opus, wav, m4a, mp3) e o provedor aceita. */
export type StsAudioFormat = "mp3" | "wav" | "ogg" | "webm" | "m4a";

/** Bytes lidos para identificar o container (ID3 + cabeçalho de frame mp3 já bastam). */
export const STS_SNIFF_BYTES = 16;

function startsWith(bytes: Uint8Array, ascii: string): boolean {
  if (bytes.length < ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identifica o container pelos BYTES reais. Devolve `null` quando não é nenhum
 * áudio reconhecido — o chamador recusa em vez de mandar payload que o provedor
 * recusaria (ou, pior, tratar como áudio).
 */
export function sniffStsAudioFormat(bytes: Uint8Array): StsAudioFormat | null {
  if (bytes.length >= 12 && startsWith(bytes, "RIFF") && startsWith(bytes.subarray(8), "WAVE")) {
    return "wav";
  }
  if (startsWith(bytes, "OggS")) return "ogg";
  // EBML (webm/mkv): 0x1A 0x45 0xDF 0xA3
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "webm";
  }
  // ISO-BMFF (mp4/m4a): "ftyp" no offset 4.
  if (bytes.length >= 8 && startsWith(bytes.subarray(4), "ftyp")) return "m4a";
  if (startsWith(bytes, "ID3")) return "mp3";
  // Frame MPEG sem tag ID3: sincronismo de 11 bits (0xFF + top 3 bits em 1).
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  return null;
}

/** Recusa tipada do upload (status + mensagem), ou `null` quando pode seguir. */
export interface StsUploadRejection {
  status: number;
  error: string;
}

/** Lê só os primeiros bytes do arquivo — o suficiente para o container. */
async function readHead(file: File): Promise<Uint8Array> {
  const head = await file.slice(0, STS_SNIFF_BYTES).arrayBuffer();
  return new Uint8Array(head);
}

/**
 * Confere tamanho real e conteúdo ANTES de gastar o provedor. O `File.type`
 * declarado NÃO é fonte de verdade: a prova do tipo é a assinatura dos bytes.
 * O `maxBytes` é explícito por chamador — cada rota mantém o seu teto.
 */
export async function validateStsUpload(
  file: File,
  maxBytes: number = MAX_STS_AUDIO_BYTES,
): Promise<StsUploadRejection | null> {
  if (file.size === 0) {
    return { status: 400, error: "Arquivo de áudio vazio" };
  }
  if (file.size > maxBytes) {
    return {
      status: 413,
      error: `Arquivo de áudio grande demais (máximo ${maxBytes} bytes)`,
    };
  }
  if (!sniffStsAudioFormat(await readHead(file))) {
    return { status: 415, error: "Conteúdo não é um áudio reconhecido" };
  }
  return null;
}

/**
 * `true` quando o `content-length` anunciado já estoura o teto — barrado ANTES de
 * `req.formData()`, para o corpo abusivo nunca ser lido para a memória. O
 * cabeçalho pode mentir para BAIXO; o `size` real fecha isso em `validateStsUpload`.
 */
export function announcedAudioTooLarge(req: Request, maxBytes: number): boolean {
  const announced = Number(req.headers.get("content-length") ?? "");
  return Number.isFinite(announced) && announced > maxBytes;
}
