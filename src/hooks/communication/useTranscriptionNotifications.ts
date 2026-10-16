import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { playNotificationSound, showBrowserNotification, requestNotificationPermission } from '@/utils/notificationSounds';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';

interface TranscriptionNotificationOptions {
  enabled?: boolean;
  showToast?: boolean;
  playSound?: boolean;
  showBrowserNotification?: boolean;
}

export function useTranscriptionNotifications(options: TranscriptionNotificationOptions = {}) {
  const { 
    enabled = true, 
    showToast = true, 
    playSound = true, 
    showBrowserNotification: showBrowserNotif = true 
  } = options;

  const { settings, isQuietHours } = useNotificationSettings();
  const processedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Request notification permission on mount
    void requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!enabled || !settings.transcriptionNotificationEnabled) return;

    // O handler do canal é assíncrono (espera a busca do contato). Sem este sinalizador, uma
    // notificação já em voo seguia até o fim e alertava DEPOIS de o hook ser desativado/desmontado
    // (o `removeChannel` do cleanup só fecha o canal; não cancela a continuação agendada).
    let desativado = false;

    const channel = supabase
      .channel('transcription-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          if (desativado) return;

          const newData = payload.new as { id: string; transcription_status?: string; transcription?: string; contact_id?: string };
          const oldData = payload.old as { transcription_status?: string } | undefined;

          // Check if transcription just completed
          if (
            newData.transcription_status === 'completed' &&
            oldData?.transcription_status !== 'completed' &&
            newData.transcription &&
            !processedIdsRef.current.has(newData.id)
          ) {
            // Mark as processed to avoid duplicate notifications
            processedIdsRef.current.add(newData.id);

            // Check quiet hours
            if (isQuietHours()) {
              return;
            }

            // Get contact name
            let contactName = 'Contato';
            if (newData.contact_id) {
              const { data: contact } = await supabase
                .from('contacts')
                .select('name')
                .eq('id', newData.contact_id)
                .single();
              
              if (contact?.name) {
                contactName = contact.name;
              }
            }

            // A busca acima pode ter demorado: se o hook saiu de cena nesse meio-tempo, nada de
            // toast/som/notificação — a notificação pendente é descartada.
            if (desativado) return;

            // Truncate transcription for preview
            const transcriptionPreview = newData.transcription.length > 100
              ? newData.transcription.slice(0, 100) + '...'
              : newData.transcription;

            // Show toast notification
            if (showToast) {
              toast({
                title: '🎙️ Áudio transcrito',
                description: `${contactName}: "${transcriptionPreview}"`,
                duration: 5000,
              });
            }

            // Play sound
            if (playSound && settings.soundEnabled) {
              playNotificationSound('message', settings.transcriptionSoundType, settings.soundVolume);
            }

            // Show browser notification
            if (showBrowserNotif && settings.browserNotifications) {
              showBrowserNotification(
                'Áudio transcrito',
                `${contactName}: "${transcriptionPreview}"`,
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      desativado = true;
      supabase.removeChannel(channel);
    };
  }, [enabled, showToast, playSound, showBrowserNotif, settings, isQuietHours, settings.transcriptionNotificationEnabled]);

  // Cleanup processed IDs periodically to prevent memory leak
  useEffect(() => {
    const interval = setInterval(() => {
      if (processedIdsRef.current.size > 100) {
        const idsArray = Array.from(processedIdsRef.current);
        processedIdsRef.current = new Set(idsArray.slice(-50));
      }
    }, 60000);

    return () => clearInterval(interval);
  }, []);
}
