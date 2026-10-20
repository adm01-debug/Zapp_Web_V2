/**
 * Limites de PTT (Push-to-Talk) compatíveis com WhatsApp / Evolution API.
 * Portado do Zapp_Web_V3 (`src/lib/audio/pttLimits.ts`) — PE-24: uma fonte só
 * para o teto, em vez de números soltos espalhados pelo front.
 *
 * Usado em DOIS pontos:
 *  1. `useAudioRecorder` — corta a gravação automaticamente ao atingir
 *     `MAX_PTT_DURATION_SEC`.
 *  2. `useRealtimeInbox.handleSendAudio` — bloqueia upload e envio quando o blob
 *     excede tamanho/duração, ANTES de subir para o bucket.
 */

/** Duração máxima de um PTT aceita pelo WhatsApp/Evolution API. */
export const MAX_PTT_DURATION_SEC = 16 * 60; // 16 min
/** Tamanho máximo de um PTT aceito pelo WhatsApp/Evolution API. */
export const MAX_PTT_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB
/** Duração mínima de um PTT — abaixo disso o áudio é tratado como toque acidental. */
export const MIN_PTT_DURATION_SEC = 0.5;
/** Rede de segurança do probe: codecs que travam o `loadedmetadata` (Chromium). */
export const PROBE_TIMEOUT_MS = 4000;

/** Resultado da validação de um blob de PTT antes do upload. */
export interface PttValidationResult {
  ok: boolean;
  /** Mensagem amigável, pronta para o aviso ao usuário. Sempre presente quando `ok=false`. */
  message?: string;
  /** Duração medida em segundos (ausente quando o navegador não conseguiu decodificar). */
  durationSec?: number;
}

/** Override opcional de limites (testes e contas com teto menor). */
export interface PttLimits {
  maxBytes?: number;
  maxDurationSec?: number;
  minDurationSec?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Lê os metadados do blob para descobrir a duração real do áudio.
 * Devolve `undefined` quando o navegador não consegue decodificar — e também em
 * ambiente sem blob URL nem `<audio>` (jsdom, SSR): nesse caso a duração é
 * DESCONHECIDA (não é áudio inválido) e a validação segue pelo tamanho.
 */
export function probeAudioDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      resolve(undefined);
      return;
    }

    let url: string;
    try {
      url = URL.createObjectURL(blob);
    } catch {
      resolve(undefined);
      return;
    }

    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    let settled = false;
    /** Remove listeners e revoga a object URL (evita vazamento). */
    const cleanup = () => {
      if (settled) return;
      settled = true;
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
      URL.revokeObjectURL(url);
    };

    const onLoaded = () => {
      const d = audio.duration;
      cleanup();
      resolve(Number.isFinite(d) && d > 0 ? d : undefined);
    };
    const onError = () => {
      cleanup();
      resolve(undefined);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
    audio.src = url;

    // Sem `settled`, o safety net disparado depois do loaded revogaria a URL de novo.
    setTimeout(() => {
      cleanup();
      resolve(undefined);
    }, PROBE_TIMEOUT_MS);
  });
}

/**
 * Valida tamanho e duração de um blob de PTT antes do upload.
 * NÃO faz upload — apenas inspeciona. Primeiro o tamanho (síncrono e barato),
 * depois a duração via `<audio>` para reforçar o teto de 16 min.
 */
export async function validatePttBlob(blob: Blob, limits: PttLimits = {}): Promise<PttValidationResult> {
  const maxBytes = limits.maxBytes ?? MAX_PTT_SIZE_BYTES;
  const maxDuration = limits.maxDurationSec ?? MAX_PTT_DURATION_SEC;
  const minDuration = limits.minDurationSec ?? MIN_PTT_DURATION_SEC;

  if (!blob || blob.size === 0) {
    return { ok: false, message: 'Áudio vazio. Tente gravar novamente.' };
  }

  if (blob.size > maxBytes) {
    return {
      ok: false,
      message: `Áudio muito grande (${formatBytes(blob.size)}). Limite: ${formatBytes(maxBytes)}.`,
    };
  }

  const durationSec = await probeAudioDuration(blob);

  if (durationSec !== undefined) {
    if (durationSec < minDuration) {
      return {
        ok: false,
        durationSec,
        message: 'Áudio muito curto. Mantenha o botão pressionado para gravar.',
      };
    }
    if (durationSec > maxDuration) {
      return {
        ok: false,
        durationSec,
        message: `Áudio muito longo (${formatSeconds(durationSec)}). Limite: ${formatSeconds(maxDuration)}.`,
      };
    }
  }

  return { ok: true, durationSec };
}
