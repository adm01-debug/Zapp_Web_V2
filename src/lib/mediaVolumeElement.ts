/**
 * Aplicação do volume das mídias no `HTMLMediaElement` (e no caminho WebAudio de
 * fallback do iOS/Safari, onde `element.volume` é somente-leitura — D5/E09/E10).
 *
 * ÂNCORA (não unificar): o `AudioContext` daqui é **dedicado à mídia de conversa** e
 * nunca deve ser o mesmo dos alertas (`utils/notificationSound*.ts`). Um `ctx.close()`
 * em um dos caminhos mataria o outro; e o ganho dos alertas tem de continuar vindo
 * exclusivamente de `settings.soundVolume`.
 */
import { getSnapshot, subscribe, toGain } from '@/lib/mediaVolumeStore';

let nativeVolumeSupportCache: boolean | null = null;

let mediaAudioContext: AudioContext | null = null;
let mediaAudioContextResolved = false;
const elementGainNodes = new WeakMap<HTMLMediaElement, GainNode>();

/**
 * E09 — detecta se `element.volume` é gravável (no iOS é read-only e o sistema manda).
 * Grava 0.5 e lê de volta; o resultado fica em cache (o comportamento é do agente,
 * não do elemento).
 */
export function detectNativeVolumeSupport(): boolean {
  if (nativeVolumeSupportCache !== null) return nativeVolumeSupportCache;
  try {
    if (typeof document === 'undefined') {
      nativeVolumeSupportCache = false;
      return nativeVolumeSupportCache;
    }
    const probe = document.createElement('audio');
    const previous = probe.volume;
    probe.volume = 0.5;
    nativeVolumeSupportCache = probe.volume === 0.5;
    probe.volume = previous;
  } catch {
    nativeVolumeSupportCache = false;
  }
  return nativeVolumeSupportCache;
}

/** E10 — instância de `AudioContext` exclusiva da mídia (ver âncora acima). */
export function getMediaAudioContext(): AudioContext | null {
  if (mediaAudioContextResolved) return mediaAudioContext;
  mediaAudioContextResolved = true;
  try {
    const Ctor = getAudioContextConstructor();
    if (!Ctor) return null;
    mediaAudioContext = new Ctor();
  } catch {
    mediaAudioContext = null;
  }
  return mediaAudioContext;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  return typeof AudioContext !== 'undefined'
    ? AudioContext
    : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/**
 * Existe algum caminho para aplicar o volume neste agente? (E06/E09)
 * Sem `volume` gravável e sem `AudioContext` o slider fica desabilitado com explicação —
 * melhor do que um controle que não faz nada.
 */
export function isMediaVolumeControllable(): boolean {
  if (detectNativeVolumeSupport()) return true;
  return getAudioContextConstructor() !== undefined;
}

function getElementGainNode(element: HTMLMediaElement): GainNode | null {
  const context = getMediaAudioContext();
  if (!context) return null;

  const existing = elementGainNodes.get(element);
  if (existing) return existing;

  try {
    // `createMediaElementSource` só pode ser chamado uma vez por elemento — por isso
    // o registry; a segunda chamada lança e derrubaria o player inteiro.
    const source = context.createMediaElementSource(element);
    const gain = context.createGain();
    source.connect(gain);
    gain.connect(context.destination);
    elementGainNodes.set(element, gain);
    // iOS/Safari criam o contexto suspenso fora de um gesto: retomar é no-op até o
    // primeiro play do usuário, e sem isso o áudio sairia mudo.
    if (context.state === 'suspended') void context.resume().catch(() => {});
    return gain;
  } catch {
    return null;
  }
}

/**
 * Aplica o ganho perceptual no elemento, sem tocar no mute (usado pelos previews
 * que são deliberadamente mudos, como o vídeo no hover do balão — E20).
 */
export function applyMediaVolumeGain(element: HTMLMediaElement, gain: number): void {
  if (detectNativeVolumeSupport()) {
    element.volume = gain;
    return;
  }
  const gainNode = getElementGainNode(element);
  if (gainNode) {
    gainNode.gain.value = gain;
    return;
  }
  // Sem `AudioContext` disponível não há como reduzir o volume neste agente:
  // fica no volume do sistema em vez de fingir que aplicou.
  element.volume = gain;
}

/** Aplica ganho + mute (E07). */
export function applyMediaVolume(element: HTMLMediaElement, gain: number, muted: boolean): void {
  applyMediaVolumeGain(element, gain);
  element.muted = muted;
}

/**
 * E08 — helper imperativo para players criados com `new Audio(...)` (TTS, voice
 * changer, memes), que não têm ref do React. Devolve a função de desligamento.
 */
export function attachMediaVolume(element: HTMLMediaElement): () => void {
  const apply = () => {
    const { volume, muted } = getSnapshot();
    applyMediaVolume(element, toGain(volume), muted);
  };

  apply();
  // A URL assinada renova e o elemento é recriado/recarregado: sem isso o volume
  // volta a 100% no meio da sessão (E44).
  element.addEventListener('loadedmetadata', apply);
  const unsubscribe = subscribe(apply);

  return () => {
    element.removeEventListener('loadedmetadata', apply);
    unsubscribe();
  };
}

/**
 * E26 — `null` = indeterminado (o agente não expõe API confiável), que é tratado como
 * "tem áudio": desabilitar o controle por engano é pior do que não avisar.
 * Cada agente responde pela sua própria sonda (a primeira que existe decide, sem
 * cair para a próxima), porque elas enxergam coisas diferentes:
 * - `mozHasAudio` (Firefox) responde a partir dos metadados;
 * - `webkitAudioDecodedByteCount` (Chromium) só é prova de ausência depois de o
 *   elemento realmente decodificar (por isso o gate de readyState/currentTime);
 * - `audioTracks` (WebKit) vem preenchido nos metadados, não antes deles.
 */
export function detectVideoAudioTrack(element: HTMLVideoElement): boolean | null {
  const probe = element as HTMLVideoElement & {
    mozHasAudio?: boolean;
    webkitAudioDecodedByteCount?: number;
    audioTracks?: { length: number };
  };

  if (typeof probe.mozHasAudio === 'boolean') return probe.mozHasAudio;

  if (typeof probe.webkitAudioDecodedByteCount === 'number') {
    const hasDecoded = element.readyState >= 3 && element.currentTime > 0;
    return hasDecoded ? probe.webkitAudioDecodedByteCount > 0 : null;
  }

  if (probe.audioTracks && typeof probe.audioTracks.length === 'number') {
    if (element.readyState < 1) return null;
    return probe.audioTracks.length > 0;
  }

  return null;
}
