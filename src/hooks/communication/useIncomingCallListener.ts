import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '../auth/useAuth';
import { log } from '@/lib/logger';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';

export interface IncomingCall {
  id: string;
  contact_id: string | null;
  contact_name: string;
  contact_phone: string;
  is_video: boolean;
  whatsapp_connection_id: string | null;
  started_at: string;
}

interface IncomingCallNotification {
  id: string;
  user_id: string;
  type: string;
  message: string;
  created_at: string;
  metadata: {
    contact_id?: string;
    contact_name?: string;
    phone?: string;
    is_video?: boolean;
    call_status?: string;
    whatsapp_connection_id?: string;
    event_id?: string;
  } | null;
}

export function useIncomingCallListener() {
  const { user } = useAuth();
  const [incomingState, setIncomingState] = useState<{ userId: string; call: IncomingCall } | null>(null);
  const seenNotificationsRef = useRef(new Set<string>());
  const recentProviderEventsRef = useRef(new Map<string, number>());
  const deliveryGenerationRef = useRef(0);

  const dismissCall = useCallback(() => {
    deliveryGenerationRef.current += 1;
    setIncomingState(null);
  }, []);

  useEffect(() => {
    deliveryGenerationRef.current += 1;
    seenNotificationsRef.current.clear();
    recentProviderEventsRef.current.clear();
    if (!user?.id) return;

    let active = true;
    const subscribedUserId = user.id;

    const channel = supabase
      .channel(uniqueRealtimeTopic('incoming-calls'))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const notification = payload.new as IncomingCallNotification;
          if (notification.type !== 'incoming_call') return;

          const metadata = notification.metadata || {};
          const status = typeof metadata.call_status === 'string'
            ? metadata.call_status.toLowerCase()
            : '';
          if (status !== 'ringing' && status !== 'offer') return;

          if (seenNotificationsRef.current.has(notification.id)) return;
          seenNotificationsRef.current.add(notification.id);
          if (seenNotificationsRef.current.size > 100) {
            const oldest = seenNotificationsRef.current.values().next().value;
            if (oldest) seenNotificationsRef.current.delete(oldest);
          }

          // Only a provider event ID proves replay identity. Contact +
          // connection would also collapse a legitimate second call.
          const callKey = metadata.event_id;
          const now = Date.now();
          if (callKey) {
            const lastSeen = recentProviderEventsRef.current.get(callKey);
            if (lastSeen && now - lastSeen < 35_000) return;
            recentProviderEventsRef.current.set(callKey, now);
            for (const [key, timestamp] of recentProviderEventsRef.current) {
              if (now - timestamp >= 35_000) recentProviderEventsRef.current.delete(key);
            }
          }

          const deliveryGeneration = ++deliveryGenerationRef.current;

          let contactName = metadata.contact_name || 'Desconhecido';
          let contactPhone = metadata.phone || '';

          // Compatibilidade com notificacoes emitidas antes de contact_name.
          if (!metadata.contact_name && metadata.contact_id) {
            const { data: contact } = await supabase
              .from('contacts')
              .select('name, phone')
              .eq('id', metadata.contact_id)
              .single();

            if (contact) {
              contactName = contact.name || contact.phone;
              contactPhone = contact.phone;
            }
          }

          if (!active || deliveryGeneration !== deliveryGenerationRef.current) return;

          setIncomingState({
            userId: subscribedUserId,
            call: {
              id: notification.id,
              contact_id: metadata.contact_id || null,
              contact_name: contactName,
              contact_phone: contactPhone,
              is_video: metadata.is_video === true,
              whatsapp_connection_id: metadata.whatsapp_connection_id || null,
              started_at: notification.created_at,
            },
          });

          log.info('Incoming call notification received', { notificationId: notification.id });
        }
      )
      .subscribe();

    return () => {
      active = false;
      deliveryGenerationRef.current += 1;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const incomingCall = incomingState && incomingState.userId === user?.id ? incomingState.call : null;
  return { incomingCall, dismissCall };
}
