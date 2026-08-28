 import { useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { RealtimePostgresChangesPayload, RealtimeChannel } from '@supabase/supabase-js';
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
     enabled = true
   } = config;
 
   const handlePayload = useCallback((payload: RealtimePostgresChangesPayload<T>) => {
     if (onAll) onAll(payload);
     if (payload.eventType === 'INSERT' && onInsert) onInsert(payload);
     if (payload.eventType === 'UPDATE' && onUpdate) onUpdate(payload);
     if (payload.eventType === 'DELETE' && onDelete) onDelete(payload);
   }, [onInsert, onUpdate, onDelete, onAll]);
 
  useEffect(() => {
    if (!enabled) return;

    let channel: RealtimeChannel;
    let retryTimeout: NodeJS.Timeout;
    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    const subscribe = () => {
      try {
        channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema,
              table,
              // Omit filter entirely when undefined — passing filter:undefined
              // causes a "mismatch between server and client bindings" error in
              // Supabase Realtime because the server hashes the binding config
              // including the filter key.
              ...(filter !== undefined ? { filter } : {}),
            },
            handlePayload
          )
          .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              log.debug(`Realtime subscribed: ${channelName}`);
              attempts = 0;
            } else if (status === 'CHANNEL_ERROR') {
              log.error(`Realtime channel error (${channelName}):`, err);
              if (attempts < MAX_ATTEMPTS) {
                attempts++;
                const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
                log.warn(`Retrying realtime connection (${channelName}) in ${delay}ms... (Attempt ${attempts}/${MAX_ATTEMPTS})`);
                retryTimeout = setTimeout(subscribe, delay);
              }
            } else if (status === 'CLOSED') {
              log.debug(`Realtime channel closed: ${channelName}`);
            }
          });
      } catch (err) {
        log.error(`Failed to subscribe to realtime (${channelName}):`, err);
      }
    };

    subscribe();

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [enabled, channelName, schema, table, filter, handlePayload]);
 }