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
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const seenNotificationsRef = useRef(new Set<string>());
  const recentCallsRef = useRef(new Map<string, number>());

  const dismissCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

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

          const callKey = metadata.event_id || [metadata.contact_id, metadata.whatsapp_connection_id].filter(Boolean).join(':');
          const now = Date.now();
          if (callKey) {
            const lastSeen = recentCallsRef.current.get(callKey);
            if (lastSeen && now - lastSeen < 35_000) return;
            recentCallsRef.current.set(callKey, now);
            for (const [key, timestamp] of recentCallsRef.current) {
              if (now - timestamp >= 35_000) recentCallsRef.current.delete(key);
            }
          }

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

          setIncomingCall({
            id: notification.id,
            contact_id: metadata.contact_id || null,
            contact_name: contactName,
            contact_phone: contactPhone,
            is_video: metadata.is_video === true,
            whatsapp_connection_id: metadata.whatsapp_connection_id || null,
            started_at: notification.created_at,
          });

          log.info('Incoming call notification received', { notificationId: notification.id });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { incomingCall, dismissCall };
}
