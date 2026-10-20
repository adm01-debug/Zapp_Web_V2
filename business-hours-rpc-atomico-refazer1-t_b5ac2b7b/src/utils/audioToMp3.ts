/**
 * Conversão de áudio para MP3 no navegador (Web Audio API + lamejs).
 * Padroniza qualquer formato decodificável pelo browser em MP3 128 kbps mono,
 * garantindo reprodução universal (iOS/Android/desktop) no bucket audio-memes.
 *
 * lamejs 1.2.1 é self-hosted em /vendor/lamejs-1.2.1.min.js (mesma origem —
 * imune a CDN fora/adblock/CSP). Encode em pipeline com yield periódico para
 * não congelar a UI em áudios longos.
 */

const LAMEJS_URL = '/vendor/lamejs-1.2.1.min.js';
const LAMEJS_SCRIPT_SELECTOR = 'script[data-lamejs="1"]';
/** Teto de espera do carregamento — sem evento, a conversão não fica pendurada. */
export const LAMEJS_LOAD_TIMEOUT_MS = 15000;
const MP3_BITRATE = 128;
const MP3_SAMPLE_RATE = 44100;
/** Duração máxima aceitável — acima disso o MP3 estouraria limites práticos. */
export const MAX_AUDIO_DURATION_S = 600; // 10 min
const YIELD_EVERY_BLOCKS = 200;

type AudioContextConstructor = new () => AudioContext;

declare global {
  interface Window {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  }
}

interface LamejsModule {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
    encodeBuffer: (samples: Int16Array) => Int8Array;
    flush: () => Int8Array;
  };
}

let lamejsCache: LamejsModule | null = null;
let lamejsLoadPromise: Promise<LamejsModule> | null = null;

function readLamejsGlobal(): LamejsModule | null {
  const w = window as unknown as { lamejs?: LamejsModule };
  return w.lamejs ?? null;
}

/**
 * Uma tentativa efetiva de carregamento: elemento novo, listeners próprios e prazo.
 * Qualquer elemento de tentativa anterior — inclusive o que já falhou — sai do
 * documento: sem um evento novo, reaproveitá-lo significaria esperar para sempre.
 */
function startLamejsLoad(): Promise<LamejsModule> {
  return new Promise<void>((resolve, reject) => {
    document.querySelectorAll<HTMLScriptElement>(LAMEJS_SCRIPT_SELECTOR).forEach((el) => el.remove());

    const s = document.createElement('script');
    // Listeners fora no primeiro evento: nada de listener órfão num elemento encerrado.
    const detach = () => {
      s.removeEventListener('load', onLoad);
      s.removeEventListener('error', onError);
    };
    // Sem evento algum (rede pendurada, script removido por terceiro): o prazo
    // encerra a espera e devolve resultado discriminado ao chamador.
    const timer = setTimeout(() => {
      detach();
      s.remove();
      reject(new Error(`Timeout ao carregar lamejs (${LAMEJS_LOAD_TIMEOUT_MS}ms)`));
    }, LAMEJS_LOAD_TIMEOUT_MS);
    const onLoad = () => { clearTimeout(timer); detach(); resolve(); };
    const onError = () => { clearTimeout(timer); detach(); s.remove(); reject(new Error('Falha ao carregar lamejs')); };

    s.src = LAMEJS_URL;
    s.async = true;
    s.dataset.lamejs = '1';
    s.addEventListener('load', onLoad);
    s.addEventListener('error', onError);
    document.head.appendChild(s);
  }).then(() => {
    const ctx = readLamejsGlobal();
    if (!ctx) throw new Error('lamejs não disponível após load');
    lamejsCache = ctx;
    return lamejsCache;
  });
}

/** Carrega lamejs uma única vez por sessão (script tag + Promise compartilhada). */
function loadLamejs(): Promise<LamejsModule> {
  if (lamejsCache) return Promise.resolve(lamejsCache);
  // Global já presente (script carregado por outro caminho): usa sem nova tag.
  const fromGlobal = readLamejsGlobal();
  if (fromGlobal) {
    lamejsCache = fromGlobal;
    return Promise.resolve(fromGlobal);
  }
  // Promise compartilhada: chamadas concorrentes aguardam o MESMO load — sem
  // listeners órfãos em script cujo evento 'load' já disparou (race que travava o upload).
  if (!lamejsLoadPromise) {
    lamejsLoadPromise = startLamejsLoad().catch((err) => {
      // Permite retry: não deixa promessa rejeitada em cache. A tentativa
      // seguinte cria um carregamento novo (startLamejsLoad).
      lamejsLoadPromise = null;
      throw err;
    });
  }
  return lamejsLoadPromise;
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    // NaN/Inf de arquivos corrompidos → 0 (silêncio pontual), evita glitch no resample
    const v = Number.isFinite(input[i]) ? input[i] : 0;
    const s = Math.max(-1, Math.min(1, v));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Downmix estéreo→mono somando canais (meme não precisa de estéreo). */
function downmixToMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const out = new Float32Array(len);
  const chs = buffer.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i] / chs;
  }
  return out;
}

/** Duração em segundos de um MP3 CBR — trivial: bytes*8/bitrate. */
function cbrDurationSeconds(blobSize: number): number {
  return Math.round((blobSize * 8 / (MP3_BITRATE * 1000)) * 100) / 100;
}

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

export type ConvertAudioResult =
  | { ok: true; blob: Blob; fileName: string; durationSeconds: number }
  | { ok: false; reason: 'decode-failed' | 'too-long' | 'encoder-unavailable'; detail?: string };

/**
 * Converte um File/Blob de áudio para MP3 (audio/mpeg, mono, 128 kbps, 44.1 kHz).
 * Retorna resultado discriminado — o chamador decide o fallback.
 */
export async function convertAudioToMp3(file: File | Blob, originalName: string): Promise<ConvertAudioResult> {
  let lamejs: LamejsModule;
  try {
    lamejs = await loadLamejs();
  } catch (err) {
    return { ok: false, reason: 'encoder-unavailable', detail: String(err) };
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err) {
    return { ok: false, reason: 'decode-failed', detail: String(err) };
  }

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return { ok: false, reason: 'encoder-unavailable', detail: 'AudioContext indisponível' };
  const audioCtx = new AC();
  try {
    if (audioCtx.state === 'suspended') {
      // Contexto suspenso (iOS sem user-gesture ativo) → tenta retomar; se não der,
      // segue: decodeAudioData geralmente funciona mesmo suspenso.
      try { await audioCtx.resume(); } catch { /* ignora */ }
    }

    let decoded: AudioBuffer;
    try {
      // slice(0): Safari antigo detaches o buffer — cópia defensiva
      decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      return { ok: false, reason: 'decode-failed', detail: 'formato não decodificável pelo browser' };
    }
    arrayBuffer = new ArrayBuffer(0); // libera p/ GC antes do encode

    const duration = decoded.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      return { ok: false, reason: 'decode-failed', detail: `duração inválida (${duration})` };
    }
    if (duration > MAX_AUDIO_DURATION_S) {
      return { ok: false, reason: 'too-long', detail: `${Math.round(duration)}s > ${MAX_AUDIO_DURATION_S}s` };
    }

    const mono = downmixToMono(decoded);
    const pcm16 = floatToInt16(mono);

    let samples = pcm16;
    if (decoded.sampleRate !== MP3_SAMPLE_RATE) {
      const ratio = MP3_SAMPLE_RATE / decoded.sampleRate;
      const newLen = Math.round(pcm16.length * ratio);
      const resampled = new Int16Array(newLen);
      for (let i = 0; i < newLen; i++) {
        const srcPos = i / ratio;
        const i0 = Math.floor(srcPos);
        const i1 = Math.min(i0 + 1, pcm16.length - 1);
        const frac = srcPos - i0;
        resampled[i] = Math.round(pcm16[i0] * (1 - frac) + pcm16[i1] * frac);
      }
      samples = resampled;
    }

    const encoder = new lamejs.Mp3Encoder(1, MP3_SAMPLE_RATE, MP3_BITRATE);
    const chunks: BlobPart[] = [];
    const BLOCK = 1152;
    for (let i = 0, blk = 0; i < samples.length; i += BLOCK, blk++) {
      const buf = encoder.encodeBuffer(samples.subarray(i, i + BLOCK));
      if (buf.length > 0) chunks.push(new Uint8Array(buf));
      if (blk % YIELD_EVERY_BLOCKS === YIELD_EVERY_BLOCKS - 1) await yieldToUI();
    }
    const tail = encoder.flush();
    if (tail.length > 0) chunks.push(new Uint8Array(tail));

    const baseName = originalName.replace(/\.[^.]+$/, '');
    const blob = new Blob(chunks, { type: 'audio/mpeg' });
    return {
      ok: true,
      blob,
      fileName: `${baseName || 'audio'}.mp3`,
      durationSeconds: cbrDurationSeconds(blob.size),
    };
  } finally {
    void audioCtx.close().catch(() => undefined);
  }
}
