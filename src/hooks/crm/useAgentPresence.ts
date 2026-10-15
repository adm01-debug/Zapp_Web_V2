import { useEffect, useSyncExternalStore } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type PresenceStatus = 'online' | 'away' | 'offline';

interface PresenceRow {
  user_id: string;
  status: PresenceStatus;
  updated_at: string;
}

const TABLE = 'agent_presence';
const HEARTBEAT_MS = 25_000;
// Sem mouse, teclado ou toque por este tempo, o agente vira 'away' sozinho.
// A volta para 'online' é na primeira interação. Não é o heartbeat que muda de
// frequência: este é um timer próprio.
const IDLE_MS = 10 * 60_000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart'] as const;
// Sem heartbeat por mais que isso, tratamos como desconectado (aba fechada,
// crash, rede caiu) mesmo que o status declarado não tenha sido "offline".
const STALE_MS = 75_000;
const EMPTY: Record<string, PresenceStatus> = {};
const storageKey = (userId: string) => `zapp-presence-status:${userId}`;
const isStatus = (v: unknown): v is PresenceStatus => v === 'online' || v === 'away' || v === 'offline';

// Estado compartilhado por toda a aba (store simples + useSyncExternalStore),
// mesmo padrão do módulo anterior -- só a fonte dos dados muda de Realtime
// Presence (client-driven) para a tabela agent_presence (server-authoritative).
let channel: RealtimeChannel | null = null;
let activeUserId: string | null = null;
let myStatus: PresenceStatus = 'online';
let rows: Record<string, PresenceRow> = {};
let byUser: Record<string, PresenceStatus> = EMPTY;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let staleTimer: ReturnType<typeof setInterval> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
// Escolha manual do agente ('away'/'offline' pelo próprio agente): o detector
// de inatividade NUNCA a sobrescreve. 'online' não conta como escolha, senão a
// inatividade nunca conseguiria agir.
let manualStatus: PresenceStatus | null = null;
let joinSeq = 0;
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

function recompute() {
  const now = Date.now();
  const next: Record<string, PresenceStatus> = {};
  for (const [userId, row] of Object.entries(rows)) {
    const stale = now - Date.parse(row.updated_at) > STALE_MS;
    next[userId] = stale ? 'offline' : row.status;
  }
  byUser = next;
  emit();
}

async function upsertSelf(status: PresenceStatus) {
  if (!activeUserId) return;
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: activeUserId, status, updated_at: new Date().toISOString() });
  // Falha aqui não pode travar o heartbeat nem quebrar a UI -- só logamos para
  // não mascarar de novo o que motivou este fix (erro de presença virando
  // silêncio, ex.: "0 atendentes online" quando na verdade a escrita falhou).
  if (error) console.error('[agent-presence] upsert falhou', error);
}

function goIdle() {
  idleTimer = null;
  if (!activeUserId || manualStatus) return;
  if (myStatus !== 'online') return;
  myStatus = 'away';
  emit();
  void upsertSelf('away');
}

function resetIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!activeUserId || manualStatus) return;
  idleTimer = setTimeout(goIdle, IDLE_MS);
}

function handleActivity() {
  // Escolha manual manda: nem o timer reinicia nem o status muda.
  if (!activeUserId || manualStatus) return;
  const wasIdle = myStatus === 'away';
  resetIdleTimer();
  if (wasIdle) {
    myStatus = 'online';
    emit();
    void upsertSelf('online');
  }
}

function attachActivityListeners() {
  if (typeof window === 'undefined') return;
  for (const ev of ACTIVITY_EVENTS) {
    // passivo: só observamos a interação, nunca bloqueamos o evento
    window.addEventListener(ev, handleActivity, { passive: true });
  }
}

function detachActivityListeners() {
  if (typeof window === 'undefined') return;
  for (const ev of ACTIVITY_EVENTS) {
    window.removeEventListener(ev, handleActivity);
  }
}

function join(userId: string) {
  if (activeUserId === userId) return;
  leave();
  activeUserId = userId;
  myStatus = readStored(userId);
  // O que ficou salvo no navegador é a última escolha do agente; um 'away' ou
  // 'offline' salvo continua valendo como escolha manual depois do reload.
  manualStatus = myStatus === 'online' ? null : myStatus;
  const seq = ++joinSeq;

  void (async () => {
    // Estado inicial via SELECT direto -- não espera o primeiro evento do canal.
    const { data, error } = await supabase.from(TABLE).select('user_id, status, updated_at');
    if (seq !== joinSeq) return;
    if (error) {
      // Antes: erro engolido e `data` undefined virava lista vazia sem aviso
      // -- "0 atendentes online" ficava indistinguível de falha real de rede/RLS.
      console.error('[agent-presence] leitura inicial falhou', error);
    }
    rows = Object.fromEntries((data ?? []).map((r) => [r.user_id, r as PresenceRow]));
    recompute();

    await upsertSelf(myStatus);
    if (seq !== joinSeq) return;

    const ch = supabase
      .channel('agent-presence-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE },
        (payload: RealtimePostgresChangesPayload<PresenceRow>) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<PresenceRow> | undefined;
            if (!oldRow?.user_id) return;
            const { [oldRow.user_id]: _removed, ...rest } = rows;
            rows = rest;
          } else {
            const row = payload.new as PresenceRow;
            if (!row?.user_id) return;
            rows = { ...rows, [row.user_id]: row };
          }
          recompute();
        }
      )
      .subscribe();
    channel = ch;
  })();

  heartbeatTimer = setInterval(() => { void upsertSelf(myStatus); }, HEARTBEAT_MS);
  // Reavalia staleness periodicamente mesmo sem evento novo -- é assim que
  // um colega que fechou a aba sem cleanup vira "offline" na tela dos outros.
  staleTimer = setInterval(recompute, HEARTBEAT_MS);
  attachActivityListeners();
  resetIdleTimer();
  emit();
}

function leave() {
  // Publica 'offline' antes de soltar o usuário ativo -- antes o logout só
  // limpava timers/canal no cliente e deixava a linha do banco em 'online'
  // até o heartbeat expirar (até 75s depois de quem já saiu do app).
  if (activeUserId) {
    void upsertSelf('offline');
  }
  joinSeq++;
  activeUserId = null;
  manualStatus = null;
  rows = {};
  byUser = EMPTY;
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  detachActivityListeners();
  const ch = channel;
  channel = null;
  if (ch) void supabase.removeChannel(ch);
  emit();
}

/** Escolha do próprio agente: fica salva neste navegador e é publicada (via upsert na tabela) para os demais. */
export function setMyPresenceStatus(status: PresenceStatus) {
  myStatus = status;
  // 'away'/'offline' escolhidos pelo agente ficam travados: a inatividade não
  // os sobrescreve e a primeira interação não devolve 'online'.
  manualStatus = status === 'online' ? null : status;
  if (status === 'online') {
    resetIdleTimer();
  } else if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (activeUserId) {
    try {
      localStorage.setItem(storageKey(activeUserId), status);
    } catch {
      // storage indisponível: vale só nesta sessão
    }
    void upsertSelf(status);
  }
  emit();
}

/** Entra na presença enquanto o usuário estiver logado (montar uma vez, no AppShell). */
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

/**
 * Status de cada agente, por auth user id, vindo da tabela agent_presence
 * (server-authoritative -- cada linha só é escrita pelo próprio dono via RLS).
 * "offline" aparece tanto quando o agente escolheu explicitamente quanto
 * quando o heartbeat dele parou de chegar (desconexão sem cleanup).
 * "away" vem da escolha do agente ou da inatividade dele (10 min sem
 * mouse/teclado/toque) -- a escolha manual nunca é sobrescrita pela inatividade.
 */
export function useAgentPresenceMap(): Record<string, PresenceStatus> {
  return useSyncExternalStore(subscribe, () => byUser, () => EMPTY);
}
