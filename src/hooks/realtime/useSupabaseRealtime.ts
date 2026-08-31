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

    let channel: RealtimeChannel | null = null;

    try {
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema,
            table,
            // Omitting an absent filter is part of the server binding contract.
            ...(filter !== undefined ? { filter } : {}),
          },
          handlePayload
        )
        .subscribe((status, error) => {
          if (status === 'SUBSCRIBED') {
            log.debug(`Realtime subscribed: ${channelName}`);
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // RealtimeChannel already schedules channel rejoin and RealtimeClient
            // already reconnects the shared socket. Removing/recreating each of
            // the app's channels here races those native timers and amplifies a
            // single socket close into a thundering herd.
            log.warn(`Realtime temporarily unavailable (${channelName}); native retry active`, {
              status,
              error: error?.message,
              online: typeof navigator === 'undefined' ? undefined : navigator.onLine,
              visibility: typeof document === 'undefined' ? undefined : document.visibilityState,
            });
            return;
          }

          if (status === 'CLOSED') {
            log.debug(`Realtime channel closed: ${channelName}`);
          }
        });
    } catch (error) {
      log.error(`Failed to subscribe to realtime (${channelName}):`, error);
    }

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, channelName, schema, table, filter, handlePayload]);
}
