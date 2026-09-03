import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePushNotifications } from '../system/usePushNotifications';

interface WarRoomAlert {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  source: string | null;
  is_read: boolean;
  created_at: string;
}

export function useWarRoomAlerts(soundEnabled = true) {
  const queryClient = useQueryClient();
  const { showNotification, permission } = usePushNotifications();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize alert sound
  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgip6LbUg3WX2OgGtLPE51g3lgSkRHZXVzYFRDSWBwaV5WTFFcaGReW1haYmhkYl9eYGVpZ2VkZGRnamlnZmZnaGlpaGdnaGhpaWhoaGhpaWhoaGlpaGlpaGhpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaQ==');
    audioRef.current.volume = 0.5;
  }, []);

  const playAlertSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [soundEnabled]);

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
