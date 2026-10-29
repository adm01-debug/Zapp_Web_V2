/**
 * Formato de gravação de áudio (PTT) — G9 / SL-072.
 *
 * O gravador do inbox pedia `audio/webm;codecs=opus` fixo ao `MediaRecorder`: no
 * Safari (e em navegador sem WebM) a construção lança `NotSupportedError`, o
 * `catch` genérico culpa o microfone e o áudio não é gravado. O upload também
 * rotulava todo objeto como `webm`, então um áudio `mp4` do Safari era guardado
 * com um formato que o navegador dele não toca.
 *
 * Aqui ficam as duas decisões do cartão, em um lugar só:
 *  1. `escolherMimeGravacao()` — primeiro mime que o navegador diz suportar
 *     (`MediaRecorder.isTypeSupported`); sem nenhum, `null` para o navegador
 *     decidir o padrão.
 *  2. `formatoDeUpload()` — extensão e Content-Type reais, tirados do mime do
 *     blob (mesma decisão do SL-072 no chat interno).
 */

/** Ordem de preferência: WebM/Opus (Chrome/Edge/Firefox), MP4/AAC (Safari), Ogg/Opus (Firefox). */
export const PREFERENCIA_GRAVACAO: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

/** Formato de um objeto de áudio no storage. */
export interface FormatoUpload {
  /** Content-Type declarado no upload. */
  contentType: string;
  /** Extensão do nome do objeto. */
  extensao: string;
}

const FORMATOS_UPLOAD: Record<string, FormatoUpload> = {
  'audio/webm': { contentType: 'audio/webm', extensao: 'webm' },
  'audio/mp4': { contentType: 'audio/mp4', extensao: 'm4a' },
  'audio/m4a': { contentType: 'audio/mp4', extensao: 'm4a' },
  'audio/x-m4a': { contentType: 'audio/mp4', extensao: 'm4a' },
  'audio/ogg': { contentType: 'audio/ogg', extensao: 'ogg' },
  'audio/mpeg': { contentType: 'audio/mpeg', extensao: 'mp3' },
  'audio/mp3': { contentType: 'audio/mpeg', extensao: 'mp3' },
  'audio/aac': { contentType: 'audio/aac', extensao: 'aac' },
  'audio/wav': { contentType: 'audio/wav', extensao: 'wav' },
};

/** Tira os parâmetros do mime (`audio/webm;codecs=opus` -> `audio/webm`). */
export function mimeBase(mime: string | null | undefined): string {
  return (mime ?? '').split(';')[0].trim().toLowerCase();
}

/** Extensão e Content-Type a partir do mime REAL do blob; sem mime reconhecido, mantém webm (SL-072). */
export function formatoDeUpload(mime: string | null | undefined): FormatoUpload {
  const base = mimeBase(mime);
  return FORMATOS_UPLOAD[base] ?? { contentType: 'audio/webm', extensao: 'webm' };
}

function isTypeSupportedDoNavegador(): ((tipo: string) => boolean) | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const fn = (MediaRecorder as unknown as { isTypeSupported?: unknown }).isTypeSupported;
  return typeof fn === 'function' ? (fn as (tipo: string) => boolean).bind(MediaRecorder) : null;
}

/**
 * Primeiro mime da lista que o navegador sabe gravar.
 *
 * - `null` quando o navegador tem `isTypeSupported` e recusa TODOS os formatos:
 *   aí o `MediaRecorder` é criado sem `mimeType` (padrão do navegador) e o mime
 *   real é lido de `recorder.mimeType`.
 * - Navegador sem `isTypeSupported` (antigo, jsdom) mantém o comportamento
 *   anterior: assume a primeira preferência.
 */
export function escolherMimeGravacao(): string | null {
  const suportado = isTypeSupportedDoNavegador();
  if (!suportado) return PREFERENCIA_GRAVACAO[0];
  for (const mime of PREFERENCIA_GRAVACAO) {
    if (suportado(mime)) return mime;
  }
  return null;
}

/**
 * Mensagem pt-BR para o erro do `getUserMedia`/`MediaRecorder`. Distingue
 * permissão negada, microfone ausente e formato não suportado (G9) — antes
 * tudo caía no mesmo "Não foi possível acessar o microfone".
 */
export function mensagemErroGravacao(error: unknown): string {
  const nome = (error as { name?: string } | null | undefined)?.name ?? '';
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'Permissão do microfone negada. Autorize o acesso ao microfone no navegador e tente novamente.';
  }
  if (
    nome === 'NotFoundError' ||
    nome === 'DevicesNotFoundError' ||
    nome === 'OverconstrainedError' ||
    nome === 'NotReadableError'
  ) {
    return 'Nenhum microfone disponível. Conecte um microfone e tente novamente.';
  }
  if (nome === 'NotSupportedError') {
    return 'Este navegador não sabe gravar áudio em um formato compatível.';
  }
  return 'Não foi possível acessar o microfone.';
}
