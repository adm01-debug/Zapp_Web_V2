/**
 * Store em memória do "quem está digitando" por conversa, publicado pelo
 * `useTypingPresence` (dono real da inscrição no canal `typing:${conversationId}`)
 * e lido por qualquer outro componente (ex. `ViewersIndicator`) que precise do
 * mesmo dado SEM abrir uma segunda inscrição no mesmo tópico.
 *
 * Por quê: `supabase.channel(topic)` devolve o MESMO objeto de canal para o
 * mesmo tópico (RealtimeClient.channel, ignora os params na segunda chamada).
 * Chamar `.on('presence', ...)` nesse canal depois que ele já assinou
 * (`subscribe()`) lança `cannot add 'presence' callbacks ... after subscribe()`
 * (RealtimeChannel.on). Duas inscrições independentes no mesmo tópico sempre
 * colidem — a correção é ter UM dono da inscrição e os demais lendo este store.
 */

type TypingByUser = Record<string, boolean>;
type Listener = (typing: TypingByUser) => void;

const EMPTY: TypingByUser = {};
const state = new Map<string, TypingByUser>();
const listeners = new Map<string, Set<Listener>>();

export function publishTypingByUser(conversationId: string, typing: TypingByUser): void {
  state.set(conversationId, typing);
  listeners.get(conversationId)?.forEach((cb) => cb(typing));
}

/** Chamado no cleanup de quem publica, para não deixar "digitando" preso depois que a inscrição real fechou. */
export function clearTypingByUser(conversationId: string): void {
  state.delete(conversationId);
  listeners.get(conversationId)?.forEach((cb) => cb(EMPTY));
}

/** Assina o estado desta conversa; chama `cb` já com o valor atual (ou vazio, se ninguém publica ainda). */
export function subscribeTypingByUser(conversationId: string, cb: Listener): () => void {
  let set = listeners.get(conversationId);
  if (!set) {
    set = new Set();
    listeners.set(conversationId, set);
  }
  set.add(cb);
  cb(state.get(conversationId) ?? EMPTY);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) listeners.delete(conversationId);
  };
}
