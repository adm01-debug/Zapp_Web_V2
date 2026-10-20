import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePushNotifications } from '../system/usePushNotifications';
import { useNotificationSettings } from '../system/useNotificationSettings';

interface WarRoomAlert {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  source: string | null;
  is_read: boolean;
  created_at: string;
}

export function useWarRoomAlerts(soundEnabled?: boolean) {
  const queryClient = useQueryClient();
  const { showNotification, permission } = usePushNotifications();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { settings, isQuietHours } = useNotificationSettings();
  // Sem valor explícito do chamador, o mudo vem da preferência do usuário (`user_settings`),
  // nunca de um `true` cravado.
  const soundGate = soundEnabled ?? settings.soundEnabled;

  // Initialize alert sound
  // Fora do controle de volume de MÍDIA por definição: é ALERTA (WebAudio/HTMLMedia
  // fora do inbox) e não deve entrar no `mediaVolumeStore`. O volume dele é o volume de
  // alerta do painel (`user_settings.sound_volume`, 10-100) — não um valor fixo.
  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgip6LbUg3WX2OgGtLPE51g3lgSkRHZXVzYFRDSWBwaV5WTFFcaGReW1haYmhkYl9eYGVpZ2VkZGRnamlnZmZnaGlpaGdnaGhpaWhoaGhpaWhoaGlpaGlpaGhpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaQ==');
  }, []);

  // Volume do alerta = volume de alerta do painel (10-100 -> 0.1-1.0).
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = settings.soundVolume / 100;
  }, [settings.soundVolume]);

  const playAlertSound = useCallback(() => {
    // Alerta do War Room também respeita o mudo do painel e o horário de silêncio.
    if (soundGate && !isQuietHours() && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [soundGate, isQuietHours]);

  // Fetch existing alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ['warroom-alerts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('warroom_alerts')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50);
      return (data || []) as WarRoomAlert[];
    },
    refetchInterval: 30000,
  });

  // Real-time subscription for new alerts
  useEffect(() => {
    const channel = supabase
      .channel('warroom-alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'warroom_alerts' },
        (payload) => {
          const alert = payload.new as WarRoomAlert;
          queryClient.invalidateQueries({ queryKey: ['warroom-alerts'] });

          // Play sound
          if (alert.alert_type === 'critical') {
            playAlertSound();
            playAlertSound(); // double beep for critical
          } else {
            playAlertSound();
          }

          // Push notification
          if (permission === 'granted') {
            showNotification({
              title: `⚠️ ${alert.title}`,
              body: alert.message,
              tag: `warroom-${alert.id}`,
              requireInteraction: alert.alert_type === 'critical',
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient, playAlertSound, permission, showNotification]);

  // Dismiss alert
  const dismissAlert = async (alertId: string) => {
    await supabase.from('warroom_alerts').update({ is_read: true }).eq('id', alertId);
    queryClient.invalidateQueries({ queryKey: ['warroom-alerts'] });
  };

  // SLA breach monitor - checks every 30s and creates alerts
  useEffect(() => {
    const checkSLABreaches = async () => {
      const { data: breaches } = await supabase
        .from('conversation_sla')
        .select('id, contact_id, first_response_breached')
        .eq('first_response_breached', true);

      if (breaches && breaches.length > 0) {
        const newBreachCount = breaches.length;
        // Only alert if breaches exist (the insert will be idempotent via unique constraint check)
        const existingAlerts = alerts.filter(a => a.source === 'sla-monitor');
        if (existingAlerts.length === 0 || newBreachCount > existingAlerts.length) {
          await supabase.from('warroom_alerts').insert({
            alert_type: 'critical',
            title: `${newBreachCount} SLA(s) Violado(s)`,
            message: `Existem ${newBreachCount} conversas com SLA violado que precisam de atenção imediata.`,
            source: 'sla-monitor',
          });
        }
      }
    };

    const interval = setInterval(checkSLABreaches, 60000);
    checkSLABreaches(); // initial check
    return () => clearInterval(interval);
  }, [alerts]);

  return { alerts, dismissAlert };
}
