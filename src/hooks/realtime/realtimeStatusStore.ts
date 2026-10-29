/**
 * Estado agregado dos canais Realtime (Supabase) — o que a tela mostra quando a
 * conexão ao vivo cai.
 *
 * O `useSupabaseRealtime` entrega os status do socket (`SUBSCRIBED`,
 * `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`); cada canal registra o SEU estado aqui
 * e o agregado é derivado: um canal com erro = queda. Sem canal nenhum o estado
 * é `idle` (nada a avisar).
 *
 * O selo NÃO aparece no primeiro instante da queda: o `supabase-js` já tenta
 * reconectar sozinho e uma oscilação de meio segundo não pode virar aviso na
 * cara do atendente. Só depois de `REALTIME_STALE_GRACE_MS` (5 s) sem canal
 * saudável a flag `notice` liga — e desliga na hora em que algum canal
 * reconecta.
 *
 * Módulo puro (sem React e sem DOM): a ponte com a tela é o
 * `useSyncExternalStore`, em `useRealtimeStatus` (estado cru) e
 * `useRealtimeReconnectingNotice` (já com a carência de 5 s aplicada).
 */
import { useSyncExternalStore } from 'react';

/** Saúde de UM canal. */
export type RealtimeChannelHealth = 'connecting' | 'connected' | 'error';

/** Estado agregado que a tela consome. */
export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

/** Quanto tempo de queda o selo tolera antes de aparecer. */
export const REALTIME_STALE_GRACE_MS = 5_000;

const channels = new Map<string, RealtimeChannelHealth>();
const listeners = new Set<() => void>();

let status: RealtimeStatus = 'idle';
let notice = false;
let graceTimer: ReturnType<typeof setTimeout> | null = null;

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** Agregado: um canal em erro já derruba o conjunto; sem canal, `idle`. */
function computeStatus(): RealtimeStatus {
  if (channels.size === 0) return 'idle';
  let connected = false;
  for (const health of channels.values()) {
    if (health === 'error') return 'disconnected';
    if (health === 'connected') connected = true;
  }
  return connected ? 'connected' : 'connecting';
}

function clearGrace(): void {
  if (graceTimer !== null) {
    clearTimeout(graceTimer);
    graceTimer = null;
  }
  notice = false;
}

function applyStatus(next: RealtimeStatus): void {
  if (next === status) return;
  status = next;

  if (next === 'disconnected') {
    // Um timer só: enquanto o estado não muda, novas quedas não reiniciam a
    // carência nem acumulam timers.
    if (graceTimer === null && !notice) {
      graceTimer = setTimeout(() => {
        graceTimer = null;
        notice = true;
        notify();
      }, REALTIME_STALE_GRACE_MS);
    }
  } else {
    clearGrace();
  }

  notify();
}

/** Traduz o status cru do `supabase-js` para a saúde que este store agrega. */
export function toChannelHealth(channelStatus: string): RealtimeChannelHealth {
  if (channelStatus === 'SUBSCRIBED') return 'connected';
  if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT' || channelStatus === 'CLOSED') {
    return 'error';
  }
  return 'connecting';
}

/** Registro/reporte de um canal (a identidade é a chave física do canal). */
export function setRealtimeChannelStatus(channelName: string, health: RealtimeChannelHealth): void {
  if (channels.get(channelName) === health) return;
  channels.set(channelName, health);
  applyStatus(computeStatus());
}

/** Canal liberado (unmount) sai do agregado. */
export function removeRealtimeChannel(channelName: string): void {
  if (!channels.delete(channelName)) return;
  applyStatus(computeStatus());
}

/** Zera o store (logout/testes): sem canais, `idle` e sem selo. */
export function resetRealtimeStatus(): void {
  clearGrace();
  const changed = channels.size > 0 || status !== 'idle';
  channels.clear();
  status = 'idle';
  if (changed) notify();
}

export function getRealtimeStatusSnapshot(): RealtimeStatus {
  return status;
}

export function getRealtimeNoticeSnapshot(): boolean {
  return notice;
}

export function subscribeRealtimeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Estado agregado (primitivo estável — seguro para `getSnapshot`). */
export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(subscribeRealtimeStatus, getRealtimeStatusSnapshot, getRealtimeStatusSnapshot);
}

/** `true` quando a queda passou da carência (o selo deve aparecer na tela). */
export function useRealtimeReconnectingNotice(): boolean {
  return useSyncExternalStore(subscribeRealtimeStatus, getRealtimeNoticeSnapshot, getRealtimeNoticeSnapshot);
}
