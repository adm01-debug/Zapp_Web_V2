/**
 * Volume das mídias de conversa (áudio/vídeo das mensagens) — estado global.
 *
 * ÂNCORA (não unificar): alertas do sistema = WebAudio (`utils/notificationSound*.ts`,
 * `IncomingCallAlert`); mídia de conversa = `HTMLMediaElement`. São canais fisicamente
 * separados — escrever em `element.volume`/`element.muted` não tem efeito nenhum sobre
 * osciladores WebAudio, e mexer no `AudioContext` dos alertas não muda o volume do
 * áudio da mensagem. Se alguém "consolidar" os dois, o volume dos alertas passa a
 * depender do volume da mídia — exatamente o que este módulo existe para impedir.
 *
 * Módulo puro: sem React e sem DOM obrigatório (o acesso ao elemento fica em
 * `@/lib/mediaVolumeElement`). Estado por dispositivo, em `localStorage`, sincronizado
 * entre abas por `BroadcastChannel` (fallback: evento `storage`).
 *
 * Não importa `safeStorage`: ele puxa o logger e transformaria um módulo de estado puro
 * em dependência de rede/hidratação. O try/catch local é o mesmo contrato.
 */

export interface MediaVolumeState {
  volume: number;
  muted: boolean;
}

export const MEDIA_VOLUME_STORAGE_KEYS = {
  volume: 'zapp.media.volume',
  muted: 'zapp.media.muted',
} as const;

export const MEDIA_VOLUME_CHANNEL_NAME = 'zapp-media-volume';

/** Passo do controle: setas e scroll andam de 5 em 5 (D3). */
export const MEDIA_VOLUME_STEP = 5;

export const DEFAULT_MEDIA_VOLUME_STATE: MediaVolumeState = { volume: 80, muted: false };

type Listener = () => void;

const listeners = new Set<Listener>();

let broadcastChannel: BroadcastChannel | null = null;
let broadcastChannelResolved = false;
let storageListenerAttached = false;

/** Saneamento de leitura (E02/E03): inteiro fora de 0–100, `NaN`, `null` ou lixo → default. */
export function sanitizeStoredVolume(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return DEFAULT_MEDIA_VOLUME_STATE.volume;
  const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim() || NaN);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    return DEFAULT_MEDIA_VOLUME_STATE.volume;
  }
  return parsed;
}

/**
 * Saneamento de escrita: qualquer número finito vira inteiro preso em 0–100.
 * Prende (em vez de cair no default) porque as setas e o scroll andam de 5 em 5 —
 * "100 + 5" tem de continuar 100, não voltar para o volume padrão.
 */
export function clampVolume(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MEDIA_VOLUME_STATE.volume;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/** Curva perceptual (D3/E04): 0→0, 50→0.25, 100→1. */
export function toGain(volume: number): number {
  return (clampVolume(volume) / 100) ** 2;
}

function readPersistedState(): MediaVolumeState {
  return {
    volume: sanitizeStoredVolume(readStorage(MEDIA_VOLUME_STORAGE_KEYS.volume)),
    muted: readPersistedMuted(readStorage(MEDIA_VOLUME_STORAGE_KEYS.muted)),
  };
}

/** Leitura tolerante (E02): `localStorage` bloqueado/inexistente cai no default, sem lançar. */
function readStorage(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Escrita tolerante (E02): quota estourada ou cookies bloqueados não quebram o app. */
function writeStorage(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // O valor continua valendo nesta aba; só não sobrevive ao reload.
  }
}

function readPersistedMuted(raw: string | null): boolean {
  if (raw === null) return DEFAULT_MEDIA_VOLUME_STATE.muted;
  return raw === 'true' || raw === '1';
}

let current: MediaVolumeState = readPersistedState();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (broadcastChannelResolved) return broadcastChannel;
  broadcastChannelResolved = true;
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    broadcastChannel = new BroadcastChannel(MEDIA_VOLUME_CHANNEL_NAME);
    broadcastChannel.onmessage = (event: MessageEvent) => {
      applyExternalState(event.data);
    };
  } catch {
    // Ambiente sem BroadcastChannel (ou canal bloqueado): o evento `storage` cobre.
    broadcastChannel = null;
  }
  return broadcastChannel;
}

function publishState(state: MediaVolumeState): void {
  const channel = getBroadcastChannel();
  if (!channel) return;
  try {
    channel.postMessage({ volume: state.volume, muted: state.muted });
  } catch {
    // Canal fechado (unload): o `storage` do outro lado já não serve para nada.
  }
}

function isValidVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

/** Estado vindo de outra aba: aplica só o que é válido, sem reescrever nem reemitir. */
function applyExternalState(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  const { volume, muted } = payload as { volume?: unknown; muted?: unknown };
  const patch: Partial<MediaVolumeState> = {};
  if (isValidVolume(volume)) patch.volume = volume;
  if (typeof muted === 'boolean') patch.muted = muted;
  commit(patch, { persist: false, broadcast: false });
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key === MEDIA_VOLUME_STORAGE_KEYS.volume) {
    if (event.newValue === null) return;
    const volume = sanitizeStoredVolume(event.newValue);
    if (volume !== current.volume) commit({ volume }, { persist: false, broadcast: false });
    return;
  }
  if (event.key === MEDIA_VOLUME_STORAGE_KEYS.muted && event.newValue !== null) {
    commit({ muted: readPersistedMuted(event.newValue) }, { persist: false, broadcast: false });
  }
}

function attachStorageListener(): void {
  if (storageListenerAttached) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('storage', handleStorageEvent);
  storageListenerAttached = true;
}

interface CommitOptions {
  persist: boolean;
  broadcast: boolean;
}

function commit(patch: Partial<MediaVolumeState>, options: CommitOptions): void {
  const next: MediaVolumeState = {
    volume: patch.volume ?? current.volume,
    muted: patch.muted ?? current.muted,
  };
  if (next.volume === current.volume && next.muted === current.muted) return;

  // Referência nova só quando o valor muda: é o que faz o `useSyncExternalStore`
  // dos players re-renderizarem (D2 — um controle, um valor).
  current = next;

  if (options.persist) {
    writeStorage(MEDIA_VOLUME_STORAGE_KEYS.volume, String(current.volume));
    writeStorage(MEDIA_VOLUME_STORAGE_KEYS.muted, String(current.muted));
  }
  if (options.broadcast) publishState(current);
  emit();
}

export function getSnapshot(): MediaVolumeState {
  return current;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  getBroadcastChannel();
  attachStorageListener();
  return () => {
    listeners.delete(listener);
  };
}

export function setVolume(volume: number): void {
  commit({ volume: clampVolume(volume) }, { persist: true, broadcast: true });
}

export function setMuted(muted: boolean): void {
  commit({ muted: Boolean(muted) }, { persist: true, broadcast: true });
}

/** Mute é estado próprio (D4): desmutar devolve o volume anterior, não zera. */
export function toggleMuted(): void {
  commit({ muted: !current.muted }, { persist: true, broadcast: true });
}
