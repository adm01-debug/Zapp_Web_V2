/**
 * Estado de reprodução de um áudio de mensagem, fora do React.
 *
 * Por que um módulo: a lista de mensagens do chat é VIRTUALIZADA (`ChatMessagesArea`,
 * `overscan` ~10). Rolar um áudio que está tocando para fora da janela desmonta o
 * `<audio>` — o som para e, sem guardar o ponto, ao voltar ele recomeça do zero e em 1x.
 * O balão remonta com o MESMO `messageId`, então o estado por mensagem sobrevive aqui,
 * num Map de módulo, e é reaplicado na montagem.
 *
 * Chave = `messageId`. Guarda:
 * - `currentTime` (segundos) — onde a reprodução parou;
 * - `playbackRate` (0,5x–2x) — velocidade escolhida pelo atendente;
 * - `paused` — último estado conhecido do elemento (a reprodução NÃO é retomada sozinha:
 *   o navegador bloqueia autoplay e um som que surge do nada é o "som fantasma").
 *
 * Entradas velhas (TTL) e o excedente acima do teto são descartados, para o Map não crescer
 * junto com a conversa aberta.
 */

export interface PersistedAudioState {
  currentTime: number;
  playbackRate: number;
  paused: boolean;
}

/** Quanto tempo uma entrada continua válida sem ser tocada de novo. */
export const AUDIO_STATE_TTL_MS = 30 * 60 * 1000;

/** Teto de entradas vivas; acima disso a mais antiga sai (a lista virtualizada remonta muito). */
export const AUDIO_STATE_MAX_ENTRIES = 200;

interface AudioStateEntry {
  state: PersistedAudioState;
  updatedAt: number;
}

const entries = new Map<string, AudioStateEntry>();

function isAlive(entry: AudioStateEntry, now: number): boolean {
  return now - entry.updatedAt < AUDIO_STATE_TTL_MS;
}

/** Tira o que expirou e, se ainda sobrar, o excedente mais antigo. */
function prune(now: number): void {
  entries.forEach((entry, key) => {
    if (!isAlive(entry, now)) entries.delete(key);
  });
  while (entries.size > AUDIO_STATE_MAX_ENTRIES) {
    // O Map preserva a ordem de inserção e `saveAudioState` reinsere a chave no fim a cada
    // escrita: a primeira chave é sempre a atualizada há mais tempo.
    const oldest = entries.keys().next();
    if (oldest.done) return;
    entries.delete(oldest.value);
  }
}

function toFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Estado guardado de uma mensagem (cópia) ou `null` quando não há nada válido. */
export function readAudioState(messageId: string): PersistedAudioState | null {
  if (!messageId) return null;
  const now = Date.now();
  const entry = entries.get(messageId);
  if (!entry) return null;
  if (!isAlive(entry, now)) {
    entries.delete(messageId);
    return null;
  }
  return { ...entry.state };
}

/**
 * Funde `patch` no estado guardado da mensagem (criando com valores neutros quando não
 * existe) e devolve a cópia do que ficou guardado. Campos ausentes ou inválidos preservam o
 * valor anterior — um `currentTime` `NaN` do elemento nunca apaga a posição boa.
 */
export function saveAudioState(
  messageId: string,
  patch: Partial<PersistedAudioState>,
): PersistedAudioState | null {
  if (!messageId) return null;

  const current = readAudioState(messageId) ?? { currentTime: 0, playbackRate: 1, paused: true };
  const state: PersistedAudioState = {
    currentTime: toFinite(patch.currentTime, current.currentTime),
    playbackRate: toFinite(patch.playbackRate, current.playbackRate),
    paused: typeof patch.paused === 'boolean' ? patch.paused : current.paused,
  };

  entries.delete(messageId);
  entries.set(messageId, { state, updatedAt: Date.now() });
  prune(Date.now());
  return { ...state };
}

/** Esquece a mensagem (usado quando o áudio deixa de existir, não no desmonte). */
export function forgetAudioState(messageId: string): void {
  entries.delete(messageId);
}

/** Quantas entradas vivas existem agora — teto e expiração são medidos por aqui. */
export function audioStateCount(): number {
  prune(Date.now());
  return entries.size;
}
