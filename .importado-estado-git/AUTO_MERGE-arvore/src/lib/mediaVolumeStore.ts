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
 * `@/lib/mediaVolumeElement`). Estado POR USUÁRIO NO APARELHO (D07/S33), em
 * `localStorage` — `zapp.media.volume.<userId>` / `zapp.media.muted.<userId>` —,
 * com a chave antiga (`zapp.media.volume` / `zapp.media.muted`) migrada UMA vez
 * (S34) e ainda valendo para quem não está autenticado. Sincronizado entre abas
 * por `BroadcastChannel` (fallback: evento `storage`).
 *
 * A identidade (usuário autenticado) vem da sessão que o `supabase-js` JÁ persiste
 * no `localStorage` — mesma varredura de `e2e/fixtures/e2e-contact.ts` —, e não do
 * `AuthProvider`: os players montam fora dele (`useAuth` lança fora do provider) e
 * este módulo é puro, sem React nem rede. A leitura é preguiçosa (a cada snapshot,
 * escrita e evento), então login/logout no mesmo navegador entram em vigor sem
 * recarregar a página. Sem usuário resolvido, o comportamento é o de antes: chave
 * antiga, padrão 80.
 *
 * Não importa `safeStorage`: ele puxa o logger e transformaria um módulo de estado puro
 * em dependência de rede/hidratação. O try/catch local é o mesmo contrato.
 */

export interface MediaVolumeState {
  volume: number;
  muted: boolean;
}

/** Chaves da chave ANTIGA (sem usuário) — também são a base das chaves por usuário. */
export const MEDIA_VOLUME_STORAGE_KEYS = {
  volume: 'zapp.media.volume',
  muted: 'zapp.media.muted',
} as const;

/**
 * Marca da migração da chave antiga (S34). É por NAVEGADOR, não por usuário: a
 * chave antiga guardava o valor de quem usou o navegador por último, então ela é
 * copiada uma única vez — para o primeiro usuário resolvido depois da atualização.
 * Sem a marca, o valor de um atendente vazaria para o próximo que logasse na
 * mesma máquina (o próprio B7 que este cartão corrige).
 */
export const MEDIA_VOLUME_LEGACY_MIGRATION_KEY = 'zapp.media.migrated';

export const MEDIA_VOLUME_CHANNEL_NAME = 'zapp-media-volume';

/** Passo do controle: setas e scroll andam de 5 em 5 (D3). */
export const MEDIA_VOLUME_STEP = 5;

export const DEFAULT_MEDIA_VOLUME_STATE: MediaVolumeState = { volume: 80, muted: false };

/** Sessão do `supabase-js` no `localStorage`: `sb-<ref>-auth-token`. */
const SUPABASE_SESSION_KEY_PREFIX = 'sb-';
const SUPABASE_SESSION_KEY_SUFFIX = '-auth-token';

type Listener = () => void;

const listeners = new Set<Listener>();

let broadcastChannel: BroadcastChannel | null = null;
let broadcastChannelResolved = false;
let storageListenerAttached = false;

/**
 * Chaves de leitura/escrita de UMA identidade: com usuário, a chave por usuário
 * (S33); sem usuário, a chave antiga (o valor de quem usa o app deslogado
 * continua valendo como sempre valeu).
 */
export function mediaVolumeStorageKeys(userId: string | null): { volume: string; muted: string } {
  if (!userId) {
    return { volume: MEDIA_VOLUME_STORAGE_KEYS.volume, muted: MEDIA_VOLUME_STORAGE_KEYS.muted };
  }
  return {
    volume: `${MEDIA_VOLUME_STORAGE_KEYS.volume}.${userId}`,
    muted: `${MEDIA_VOLUME_STORAGE_KEYS.muted}.${userId}`,
  };
}

/** Saneamento de leitura (E02/E03): inteiro fora de 0–100, `NaN`, `null` ou lixo → default. */
export function sanitizeStoredVolume(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return DEFAULT_MEDIA_VOLUME_STATE.volume;
  const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim() || Number.NaN);
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

function isSupabaseSessionKey(key: string | null): boolean {
  return Boolean(key && key.startsWith(SUPABASE_SESSION_KEY_PREFIX) && key.endsWith(SUPABASE_SESSION_KEY_SUFFIX));
}

/**
 * Id do usuário autenticado da sessão persistida pelo `supabase-js` (o cliente usa
 * `window.localStorage` — `@/integrations/supabase/client`). A varredura não presume
 * o ref do projeto (o mesmo padrão já usado nos fixtures do e2e). Tolerante (E02):
 * storage bloqueado, JSON estranho ou sessão sem `user.id` → `null` = "sem usuário".
 */
function readAuthenticatedUserId(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!isSupabaseSessionKey(key)) continue;
      const raw = storage.getItem(key as string);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { access_token?: unknown; user?: { id?: unknown } } | null;
      const userId = parsed?.user?.id;
      if (typeof parsed?.access_token === 'string' && typeof userId === 'string' && userId) return userId;
    }
    return null;
  } catch {
    return null;
  }
}

function readPersistedState(userId: string | null): MediaVolumeState {
  const keys = mediaVolumeStorageKeys(userId);
  return {
    volume: sanitizeStoredVolume(readStorage(keys.volume)),
    muted: readPersistedMuted(readStorage(keys.muted)),
  };
}

/**
 * Migração ÚNICA da chave antiga (S34): copia o valor antigo para as chaves do
 * usuário resolvido e marca o navegador como migrado. Não apaga nada às cegas —
 * as chaves antigas ficam onde estão; a marca é o que impede a segunda cópia (e,
 * com ela, o vazamento do valor de um atendente para o próximo). Valor próprio do
 * usuário nunca é sobrescrito.
 */
function migrateLegacyKeys(userId: string | null): void {
  if (!userId) return;
  if (readStorage(MEDIA_VOLUME_LEGACY_MIGRATION_KEY) !== null) return;

  const keys = mediaVolumeStorageKeys(userId);
  const legacyVolume = readStorage(MEDIA_VOLUME_STORAGE_KEYS.volume);
  const legacyMuted = readStorage(MEDIA_VOLUME_STORAGE_KEYS.muted);
  if (legacyVolume !== null && readStorage(keys.volume) === null) writeStorage(keys.volume, legacyVolume);
  if (legacyMuted !== null && readStorage(keys.muted) === null) writeStorage(keys.muted, legacyMuted);
  writeStorage(MEDIA_VOLUME_LEGACY_MIGRATION_KEY, '1');
}

let currentUserId: string | null = readAuthenticatedUserId();
migrateLegacyKeys(currentUserId);
let current: MediaVolumeState = readPersistedState(currentUserId);

function emit(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Re-resolve a identidade vigente; mudou? Adota o estado persistido DELA. É isso
 * que faz o controle seguir o usuário logado, sem recarregar a página — e o que
 * impede a tela de continuar mostrando o volume de quem acabou de sair.
 */
function syncIdentity(signalListeners: boolean): void {
  const userId = readAuthenticatedUserId();
  if (userId === currentUserId) return;
  currentUserId = userId;
  migrateLegacyKeys(userId);
  current = readPersistedState(userId);
  if (signalListeners) emit();
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
    channel.postMessage({ userId: currentUserId, volume: state.volume, muted: state.muted });
  } catch {
    // Canal fechado (unload): o `storage` do outro lado já não serve para nada.
  }
}

function isValidVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

/** Estado vindo de outra aba: aplica só o que é válido e do MESMO usuário, sem reescrever nem reemitir. */
function applyExternalState(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  // A identidade pode ter mudado desde o último evento (login/logout em outra aba).
  syncIdentity(false);
  const { userId, volume, muted } = payload as { userId?: unknown; volume?: unknown; muted?: unknown };
  // Outra conta no mesmo navegador não manda no meu volume (é o B7 de novo, agora entre abas).
  if (userId !== currentUserId) return;
  const patch: Partial<MediaVolumeState> = {};
  if (isValidVolume(volume)) patch.volume = volume;
  if (typeof muted === 'boolean') patch.muted = muted;
  commit(patch, { persist: false, broadcast: false });
}

function handleStorageEvent(event: StorageEvent): void {
  // Login/logout em outra aba reescreve a sessão: re-resolve antes de olhar o volume.
  if (isSupabaseSessionKey(event.key)) {
    syncIdentity(true);
    return;
  }

  const keys = mediaVolumeStorageKeys(currentUserId);
  if (event.key === keys.volume) {
    if (event.newValue === null) return;
    const volume = sanitizeStoredVolume(event.newValue);
    if (volume !== current.volume) commit({ volume }, { persist: false, broadcast: false });
    return;
  }
  if (event.key === keys.muted && event.newValue !== null) {
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
  // Toda escrita vai para as chaves da identidade VIGENTE — nunca para a de outro usuário.
  syncIdentity(false);
  const next: MediaVolumeState = {
    volume: patch.volume ?? current.volume,
    muted: patch.muted ?? current.muted,
  };
  if (next.volume === current.volume && next.muted === current.muted) return;

  // Referência nova só quando o valor muda: é o que faz o `useSyncExternalStore`
  // dos players re-renderizarem (D2 — um controle, um valor).
  current = next;

  if (options.persist) {
    const keys = mediaVolumeStorageKeys(currentUserId);
    writeStorage(keys.volume, String(current.volume));
    writeStorage(keys.muted, String(current.muted));
  }
  if (options.broadcast) publishState(current);
  emit();
}

export function getSnapshot(): MediaVolumeState {
  // Login/logout desde a última leitura: adota o estado da identidade nova sem
  // emitir — o `useSyncExternalStore` compara o snapshot e re-renderiza sozinho
  // (emitir aqui seria avisar os listeners durante o render).
  syncIdentity(false);
  return current;
}

export function subscribe(listener: Listener): () => void {
  syncIdentity(true);
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
