import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { playNotificationSound } from '@/utils/notificationSound';
import { showBrowserNotification, requestNotificationPermission } from '@/utils/notificationSound';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { useAuth } from '@/hooks/auth/useAuth';
import { getLogger } from '@/lib/logger';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { claimNotificationEvent } from '@/lib/notificationDedupe';

const log = getLogger('SentimentAlerts');

interface SentimentAlertNotification {
  id: string;
  user_id: string;
  type: string;
  metadata: {
    contact_id?: string;
    contact_name?: string;
    contact_phone?: string;
    sentiment_score?: number;
    consecutive_low?: number;
    analysis_id?: string;
    agent_name?: string;
    message?: string;
  } | null;
  created_at: string;
}

export function useRealtimeSentimentAlerts() {
  const { user } = useAuth();
  const { settings, isQuietHours } = useNotificationSettings();

  const handleNewAlert = useCallback(async (payload: SentimentAlertNotification) => {
    if (payload.type !== 'sentiment_alert' || settings.sentimentAlertEnabled === false) return;

    const details = payload.metadata || {};
    const dedupeKey = details.analysis_id ? `sentiment:${details.analysis_id}` : `notification:${payload.id}`;
    if (!claimNotificationEvent(dedupeKey)) return;

    log.debug('Sentiment notification received', { notificationId: payload.id });
    const contactName = details.contact_name || 'Cliente';
    const sentimentScore = typeof details.sentiment_score === 'number' ? details.sentiment_score : 0;
    const consecutiveLow = typeof details.consecutive_low === 'number' ? details.consecutive_low : 0;

    // Show toast notification
    toast.error(
      `⚠️ Alerta de Sentimento: ${contactName}`,
      {
        description: `Sentimento negativo (${sentimentScore}%) detectado em ${consecutiveLow} análises consecutivas`,
        duration: 10000,
        action: {
          label: 'Ver detalhes',
          onClick: () => {
            // Navigate to sentiment dashboard
            const tabsList = document.querySelector('[value="ai"]');
            if (tabsList) {
              (tabsList as HTMLElement).click();
            }
          },
        },
      }
    );

    // Play alert sound if not in quiet hours
    if (!isQuietHours() && settings.soundEnabled) {
      try {
        playNotificationSound('alert');
      } catch (err) {
        log.error('Error playing notification sound:', err);
      }
    }

    // Show browser notification
    if (settings.browserNotifications) {
      await requestNotificationPermission();
      showBrowserNotification(
        '⚠️ Alerta de Sentimento Negativo',
        `${contactName}: Sentimento em ${sentimentScore}% (${consecutiveLow} análises consecutivas)`,
        '/favicon.ico'
      );
    }
  }, [settings, isQuietHours]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(uniqueRealtimeTopic('sentiment-alerts'))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          void handleNewAlert(payload.new as SentimentAlertNotification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleNewAlert, user?.id]);

  return null;
}
