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
  enabled?: boolean;
}

type PayloadHandler = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

interface SharedChannelEntry {
  channel: RealtimeChannel;
  listeners: Map<symbol, PayloadHandler>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

// RealtimeClient indexes channels by topic. Hooks mounted in several components
// must therefore share ownership: one consumer unmounting cannot remove the
// channel used by the others. The binding is included in the physical topic so
// an accidental reuse of channelName with a different table/filter stays isolated.
const sharedChannels = new Map<string, SharedChannelEntry>();
const CHANNEL_RELEASE_GRACE_MS = 250;

function bindingKey(channelName: string, schema: string, table: string, filter?: string) {
  return `${channelName}:${schema}:${table}:${filter ?? '*'}`;
}

function acquireSharedChannel(
  channelName: string,
  schema: string,
  table: string,
  filter: string | undefined,
  listener: PayloadHandler,
) {
  const key = bindingKey(channelName, schema, table, filter);
  let entry = sharedChannels.get(key);

  if (!entry) {
    const listeners = new Map<symbol, PayloadHandler>();
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
      });
    entry = { channel, listeners, cleanupTimer: null };
    sharedChannels.set(key, entry);
  } else if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
  }

  const token = Symbol(key);
  entry.listeners.set(token, listener);

  return () => {
    const current = sharedChannels.get(key);
    if (!current) return;
    current.listeners.delete(token);
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
    enabled = true,
  } = config;

  const handlersRef = useRef({ onInsert, onUpdate, onDelete, onAll });

  useEffect(() => {
    handlersRef.current = { onInsert, onUpdate, onDelete, onAll };
  }, [onInsert, onUpdate, onDelete, onAll]);

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
      );
    } catch (error) {
      log.error(`Failed to subscribe to realtime (${channelName}):`, error);
    }
  }, [enabled, channelName, schema, table, filter, handlePayload]);
}
