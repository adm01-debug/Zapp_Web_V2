import { useEffect, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type PresenceStatus = 'online' | 'away' | 'offline';

const CHANNEL_NAME = 'agents-presence';
const EMPTY: Record<string, PresenceStatus> = {};
const storageKey = (userId: string) => `zapp-presence-status:${userId}`;
const isStatus = (v: unknown): v is PresenceStatus => v === 'online' || v === 'away' || v === 'offline';

// Um canal de presença por aba, compartilhado por todos os consumidores (store simples + useSyncExternalStore).
let channel: RealtimeChannel | null = null;
let activeUserId: string | null = null;
let myStatus: PresenceStatus = 'online';
let byUser: Record<string, PresenceStatus> = EMPTY;
let joinSeq = 0;
let leaving: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

function readStored(userId: string): PresenceStatus {
  try {
    const v = localStorage.getItem(storageKey(userId));
    return isStatus(v) ? v : 'online';
  } catch {
    return 'online';
  }
}

function join(userId: string) {
  if (activeUserId === userId) return;
  leave();
  activeUserId = userId;
  myStatus = readStored(userId);
  const seq = ++joinSeq;
  // Espera o canal anterior sair de vez: o topic é fixo e o realtime-js reaproveita canal com o mesmo nome.
  void leaving.then(() => {
    if (seq !== joinSeq) return;
    const ch = supabase.channel(CHANNEL_NAME, { config: { presence: { key: userId } } });
    ch.on('presence', { event: 'sync' }, () => {
      const next: Record<string, PresenceStatus> = {};
      for (const [key, metas] of Object.entries(ch.presenceState())) {
        const list = metas as Array<{ status?: unknown }>;
        const last = list[list.length - 1];
        if (last && isStatus(last.status)) next[key] = last.status;
      }
      byUser = next;
      emit();
    });
    ch.subscribe((state) => {
      if (state === 'SUBSCRIBED') void ch.track({ status: myStatus });
    });
    channel = ch;
  });
  emit();
}

function leave() {
  joinSeq++;
  activeUserId = null;
  byUser = EMPTY;
  const ch = channel;
  channel = null;
  if (ch) leaving = Promise.allSettled([ch.untrack(), supabase.removeChannel(ch)]);
  emit();
}

/** Escolha do próprio agente: fica salva neste navegador e é publicada para os demais. */
export function setMyPresenceStatus(status: PresenceStatus) {
  myStatus = status;
  if (activeUserId) {
    try {
      localStorage.setItem(storageKey(activeUserId), status);
    } catch {
      // storage indisponível: vale só nesta sessão
    }
  }
  void channel?.track({ status });
  emit();
}

/** Entra no canal de presença enquanto o usuário estiver logado (montar uma vez, no AppShell). */
export function useAgentPresenceJoin(userId?: string) {
  useEffect(() => {
    if (!userId) return;
    join(userId);
    return leave;
  }, [userId]);
}

export function useMyPresenceStatus(): PresenceStatus {
  return useSyncExternalStore(subscribe, () => myStatus, () => 'online' as PresenceStatus);
}

/** Status publicado por cada agente conectado, por auth user id. Quem não está conectado não aparece. */
export function useAgentPresenceMap(): Record<string, PresenceStatus> {
  return useSyncExternalStore(subscribe, () => byUser, () => EMPTY);
}
