import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { useAuth } from '@/hooks/auth/useAuth';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { getLogger } from '@/lib/logger';

const log = getLogger('SLANotifications');

interface SLABreachPayload {
  id: string;
  contact_id: string;
  first_response_breached: boolean;
  first_message_at: string;
  first_response_at: string | null;
}

export const useSLANotifications = () => {
  const { user } = useAuth();
  const { settings, isQuietHours } = useNotificationSettings();
  const notifiedBreaches = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    log.debug('Setting up realtime subscription');

    const handleBreachNotification = async (
      contactId: string,
      slaRecordId: string
    ) => {
      // Fetch contact info
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone')
        .eq('id', contactId)
        .maybeSingle();

      const title = '⚠️ SLA de Primeira Resposta Violado';

      const description = contact
        ? `O contato ${contact.name || contact.phone} não recebeu resposta no prazo.`
        : 'Um contato não recebeu resposta dentro do prazo de SLA.';

      // Show toast
      toast({
        title,
        description,
        variant: 'destructive',
      });

      // Play sound if enabled and not in quiet hours
      if (settings.soundEnabled && settings.slaBreachSound && !isQuietHours()) {
        playNotificationSound('sla_breach', settings.soundType, settings.soundVolume);
      }

      // Show browser notification if enabled
      if (settings.browserNotifications && settings.desktopAlerts) {
        showBrowserNotification(title, description, {
          tag: `sla-breach-first-response-${slaRecordId}`,
        });
      }
    };

    const channel = supabase
      .channel('sla-breaches')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_sla',
        },
        async (payload) => {
          const newRecord = payload.new as SLABreachPayload;
          const oldRecord = payload.old as Partial<SLABreachPayload>;

          log.debug('Received update', { newRecord, oldRecord });

          // Check for new first response breach
          if (newRecord.first_response_breached && !oldRecord.first_response_breached) {
            const breachKey = `fr-${newRecord.id}`;
            if (!notifiedBreaches.current.has(breachKey)) {
              notifiedBreaches.current.add(breachKey);
              await handleBreachNotification(newRecord.contact_id, newRecord.id);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_sla',
        },
        async (payload) => {
          const newRecord = payload.new as SLABreachPayload;
          
          log.debug('New SLA record', { newRecord });

          // Check if already breached on insert
          if (newRecord.first_response_breached) {
            const breachKey = `fr-${newRecord.id}`;
            if (!notifiedBreaches.current.has(breachKey)) {
              notifiedBreaches.current.add(breachKey);
              await handleBreachNotification(newRecord.contact_id, newRecord.id);
            }
          }
        }
      )
      .subscribe((status) => {
        log.debug('Subscription status', { status });
      });

    return () => {
      log.debug('Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [user, settings, isQuietHours]);
};
