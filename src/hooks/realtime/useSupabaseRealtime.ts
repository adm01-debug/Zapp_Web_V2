import { useCallback, useEffect, useRef } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

interface RealtimeConfig<T extends { [key: string]: any }> {
  channelName: string;
  table: string;
  filter?: string;
  schema?: string;
  onInsert?: (payload: RealtimePostgresChangesPayload<T>) => void;
  onUpdate?: (payload: RealtimePostgresChangesPayload<T>) => void;
  onDelete?: (payload: RealtimePostgresChangesPayload<T>) => void;
  onAll?: (payload: RealtimePostgresChangesPayload<T>) => void;
  /**
   * Disparado quando o canal volta a receber eventos: SUBSCRIBED logo apos
   * CHANNEL_ERROR/TIMED_OUT/CLOSED, evento `online` da janela ou retorno de
   * foco (`visibilitychange` para `visible`). O consumidor revalida o que
   * ficou obsoleto durante a queda (mensagens da conversa ativa, lista de
   * conversas). Rajada de gatilhos fica limitada a uma chamada a cada
   * RECONNECT_THROTTLE_MS por callback.
   */
  onReconnect?: () => void;
  enabled?: boolean;
}

type PayloadHandler = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

interface SharedChannelEntry {
  channel: RealtimeChannel;
  listeners: Map<symbol, PayloadHandler>;
  reconnectHandlers: Set<() => void>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

// RealtimeClient indexes channels by topic. Hooks mounted in several components
// must therefore share ownership: one consumer unmounting cannot remove the
// channel used by the others. The binding is included in the physical topic so
// an accidental reuse of channelName with a different table/filter stays isolated.
const sharedChannels = new Map<string, SharedChannelEntry>();
const CHANNEL_RELEASE_GRACE_MS = 250;

// Uma queda de rede entrega varios sinais ao mesmo tempo (online mais o SUBSCRIBED
// do canal de mensagens e o do canal de contatos, por exemplo). O limite e por
// identidade do callback de reconexao (estavel via useCallback), entao canais
// irmaos do MESMO hook colapsam em uma unica revalidacao.
const RECONNECT_THROTTLE_MS = 5_000;
const reconnectThrottledAt = new WeakMap<() => void, number>();

function shouldRunReconnect(callback: () => void, now: number) {
  const last = reconnectThrottledAt.get(callback) ?? 0;
  if (now - last < RECONNECT_THROTTLE_MS) return false;
  reconnectThrottledAt.set(callback, now);
  return true;
}

function bindingKey(channelName: string, schema: string, table: string, filter?: string) {
  return `${channelName}:${schema}:${table}:${filter ?? '*'}`;
}

function acquireSharedChannel(
  channelName: string,
  schema: string,
  table: string,
  filter: string | undefined,
  listener: PayloadHandler,
  reconnect?: () => void,
) {
  const key = bindingKey(channelName, schema, table, filter);
  let entry = sharedChannels.get(key);

  if (!entry) {
    const listeners = new Map<symbol, PayloadHandler>();
    const reconnectHandlers = new Set<() => void>();
    // Estado anterior do canal, para distinguir o SUBSCRIBED inicial (nada a
    // revalidar) do SUBSCRIBED que segue uma queda.
    let lastStatus: string | null = null;
    const physicalTopic = `zapp:${key}`;
    const channel: RealtimeChannel = supabase
      .channel(physicalTopic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema,
          table,
          ...(filter !== undefined ? { filter } : {}),
        },
        (payload) => {
          for (const callback of [...listeners.values()]) callback(payload);
        },
      )
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          log.debug(`Realtime subscribed: ${channelName}`);
          if (
            lastStatus === 'CHANNEL_ERROR' ||
            lastStatus === 'TIMED_OUT' ||
            lastStatus === 'CLOSED'
          ) {
            for (const reconnectHandler of [...reconnectHandlers]) reconnectHandler();
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          log.warn(`Realtime temporarily unavailable (${channelName}); native retry active`, {
            status,
            error: error?.message,
            online: typeof navigator === 'undefined' ? undefined : navigator.onLine,
            visibility: typeof document === 'undefined' ? undefined : document.visibilityState,
          });
        } else if (status === 'CLOSED') {
          log.debug(`Realtime channel closed: ${channelName}`);
        }
        lastStatus = status;
      });
    entry = { channel, listeners, reconnectHandlers, cleanupTimer: null };
    sharedChannels.set(key, entry);
  } else if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
  }

  const token = Symbol(key);
  entry.listeners.set(token, listener);
  if (reconnect) entry.reconnectHandlers.add(reconnect);

  return () => {
    const current = sharedChannels.get(key);
    if (!current) return;
    current.listeners.delete(token);
    if (reconnect) current.reconnectHandlers.delete(reconnect);
    if (current.listeners.size > 0 || current.cleanupTimer) return;

    // Grace period absorbs React StrictMode/remount churn and prevents a new
    // subscriber from reusing a channel while removeChannel is still pending.
    current.cleanupTimer = setTimeout(() => {
      const latest = sharedChannels.get(key);
      if (latest !== current || latest.listeners.size > 0) return;
      sharedChannels.delete(key);
      void supabase.removeChannel(latest.channel);
    }, CHANNEL_RELEASE_GRACE_MS);
  };
}

export function useSupabaseRealtime<T extends { [key: string]: any }>(config: RealtimeConfig<T>) {
  const {
    channelName,
    table,
    filter,
    schema = 'public',
    onInsert,
    onUpdate,
    onDelete,
    onAll,
    onReconnect,
    enabled = true,
  } = config;

  const handlersRef = useRef({ onInsert, onUpdate, onDelete, onAll });
  const reconnectRef = useRef(onReconnect);
  const hasReconnect = onReconnect !== undefined;

  useEffect(() => {
    handlersRef.current = { onInsert, onUpdate, onDelete, onAll };
  }, [onInsert, onUpdate, onDelete, onAll]);

  useEffect(() => {
    reconnectRef.current = onReconnect;
  }, [onReconnect]);

  const triggerReconnect = useCallback(() => {
    const callback = reconnectRef.current;
    if (!callback) return;
    if (!shouldRunReconnect(callback, Date.now())) return;
    callback();
  }, []);

  const handlePayload = useCallback((payload: RealtimePostgresChangesPayload<T>) => {
    const handlers = handlersRef.current;
    handlers.onAll?.(payload);
    if (payload.eventType === 'INSERT') handlers.onInsert?.(payload);
    if (payload.eventType === 'UPDATE') handlers.onUpdate?.(payload);
    if (payload.eventType === 'DELETE') handlers.onDelete?.(payload);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    try {
      return acquireSharedChannel(
        channelName,
        schema,
        table,
        filter,
        handlePayload as PayloadHandler,
        hasReconnect ? triggerReconnect : undefined,
      );
    } catch (error) {
      log.error(`Failed to subscribe to realtime (${channelName}):`, error);
    }
  }, [enabled, channelName, schema, table, filter, handlePayload, hasReconnect, triggerReconnect]);

  // Rede de volta e aba voltando ao foco sao sinais que os navegadores dao sem
  // um novo SUBSCRIBED. Ambos revalidam, mas passam pelo mesmo limite para nao
  // somar com o SUBSCRIBED e gerar rajada de buscas.
  useEffect(() => {
    if (!enabled || !hasReconnect) return;
    if (typeof window === 'undefined') return;

    const handleOnline = () => triggerReconnect();
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') triggerReconnect();
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, hasReconnect, triggerReconnect]);
}
