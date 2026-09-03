/**
 * Conversão de áudio para MP3 no navegador (Web Audio API + lamejs).
 * Padroniza qualquer formato decodificável pelo browser em MP3 128 kbps mono,
 * garantindo reprodução universal (iOS/Android/desktop) no bucket audio-memes.
 *
 * Estratégia: lazy-load do lamejs 1.2.1 via CDN (sem dependência nova no bundle);
 * se a decodificação falhar (formato exótico que o browser não decodifica),
 * retorna null e o chamador mantém o arquivo original.
 */

const LAMEJS_URL = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
const MP3_BITRATE = 128;
const MP3_SAMPLE_RATE = 44100;

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

/** Carrega lamejs uma única vez por sessão (script tag + Promise compartilhada). */
function loadLamejs(): Promise<LamejsModule> {
  if (lamejsCache) return Promise.resolve(lamejsCache);
  // Promise compartilhada: chamadas concorrentes aguardam o MESMO load — sem
  // listeners órfãos em script cujo evento 'load' já disparou (race que travava o upload).
  if (!lamejsLoadPromise) {
    lamejsLoadPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[data-lamejs="1"]`);
      const attach = (s: HTMLScriptElement) => {
        s.addEventListener('load', () => resolve());
        s.addEventListener('error', () => reject(new Error('Falha ao carregar lamejs do CDN')));
      };
      if (existing) {
        // Se o script já terminou de carregar, o evento 'load' não dispara mais —
        // resolve imediatamente se o global já existe, senão anexa listeners.
        const w = window as unknown as { lamejs?: NonNullable<typeof lamejsCache> };
        if (w.lamejs) { resolve(); return; }
        attach(existing);
        return;
      }
      const s = document.createElement('script');
      s.src = LAMEJS_URL;
      s.async = true;
      s.dataset.lamejs = '1';
      attach(s);
      document.head.appendChild(s);
    }).then(() => {
      const ctx = window as unknown as { lamejs?: NonNullable<typeof lamejsCache> };
      if (!ctx.lamejs) throw new Error('lamejs não disponível após load');
      lamejsCache = ctx.lamejs;
      return lamejsCache;
    }).catch((err) => {
      // permite retry em falha de rede (não deixa a promise rejeitada em cache)
      lamejsLoadPromise = null;
      throw err;
    });
  }
  return lamejsLoadPromise;
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
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

export interface ConvertedAudio {
  blob: Blob;
  fileName: string;
}

/**
 * Converte um File/Blob de áudio para MP3 (audio/mpeg, mono, 128 kbps, 44.1 kHz).
 * Retorna null quando não consegue converter (chamador mantém o original).
 */
export async function convertAudioToMp3(file: File | Blob, originalName: string): Promise<ConvertedAudio | null> {
  try {
    const lamejs = await loadLamejs();
    const arrayBuffer = await file.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const audioCtx = new AC();
    try {
      let decoded: AudioBuffer;
      try {
        decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      } catch {
        return null; // formato que o browser não decodifica — mantém original
      }

      const mono = downmixToMono(decoded);
      const pcm16 = floatToInt16(mono);

      // Reamostragem simples para 44.1 kHz se necessário (linear, suficiente p/ memes)
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
      for (let i = 0; i < samples.length; i += BLOCK) {
        const buf = encoder.encodeBuffer(samples.subarray(i, i + BLOCK));
        if (buf.length > 0) chunks.push(new Uint8Array(buf));
      }
      const tail = encoder.flush();
      if (tail.length > 0) chunks.push(new Uint8Array(tail));

      const baseName = originalName.replace(/\.[^.]+$/, '');
      return {
        blob: new Blob(chunks, { type: 'audio/mpeg' }),
        fileName: `${baseName || 'audio'}.mp3`,
      };
    } finally {
      void audioCtx.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
}
