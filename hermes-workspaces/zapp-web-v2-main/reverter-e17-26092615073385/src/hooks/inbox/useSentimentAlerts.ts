import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { playNotificationSound } from '@/utils/notificationSound';
import { showBrowserNotification, requestNotificationPermission } from '@/utils/notificationSound';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { log } from '@/lib/logger';
import { claimNotificationEvent } from '@/lib/notificationDedupe';

interface SentimentAlertData {
  contactId: string;
  contactName: string;
  sentimentScore: number;
  previousScore?: number;
  analysisId: string;
}

export function useSentimentAlerts() {
  const { settings, isQuietHours } = useNotificationSettings();

  // Use user's custom threshold or default to 30
  const threshold = settings.sentimentAlertThreshold ?? 30;
  const consecutiveRequired = settings.sentimentConsecutiveCount ?? 2;
  const alertsEnabled = settings.sentimentAlertEnabled ?? true;

  const checkAndTriggerAlert = useCallback(async (data: SentimentAlertData) => {
    const { contactId, contactName, sentimentScore, previousScore, analysisId } = data;

    // The browser may belong to a supervisor analyzing a contact assigned to
    // another agent. Only the Edge Function can resolve that recipient and
    // their canonical settings, so caller-owned preferences must not gate the
    // request. Local settings below are used only to render a response that is
    // meant for this browser.
    log.debug('Checking canonical sentiment alert policy', { analysisId });

    try {
      // Call edge function to check consecutive analyses and send alerts
      const { data: alertResult, error } = await supabase.functions.invoke('sentiment-alert', {
        body: {
          contactId,
          contactName,
          sentimentScore,
          previousScore,
          analysisId,
          threshold,
          consecutiveRequired,
        },
      });

      if (error) {
        log.error('Error invoking sentiment alert:', error);
        return { triggered: false, error: error.message };
      }

      // If alert was triggered, show local notification
      if (alertResult?.alerted) {
        // The request response and Realtime row can race. Exactly one consumer
        // in this browser runtime renders the alert; other sessions still receive it.
        if (alertResult.notifyCaller !== false && claimNotificationEvent(`sentiment:${analysisId}`)) {
          toast.error(
            `⚠️ Alerta de Sentimento: ${contactName}`,
            {
              description: `Sentimento negativo (${sentimentScore}%) detectado em ${alertResult.consecutiveLow} análises consecutivas`,
              duration: 10000,
              action: {
                label: 'Ver conversa',
                onClick: () => {
                  log.debug('Navigate to conversation:', contactId);
                },
              },
            }
          );

          if (!isQuietHours() && settings.soundEnabled && settings.slaBreachSound) {
            playNotificationSound('alert');
          }

          if (settings.browserNotifications) {
            await requestNotificationPermission();
            showBrowserNotification(
              '⚠️ Alerta de Sentimento Negativo',
              `${contactName}: Sentimento em ${sentimentScore}% (${alertResult.consecutiveLow} análises consecutivas)`,
              '/favicon.ico'
            );
          }
        }

        return { 
          triggered: true, 
          consecutiveLow: alertResult.consecutiveLow,
          emailSent: alertResult.emailSent,
        };
      }

      return { triggered: false, reason: alertResult?.reason };
    } catch (err) {
      log.error('Failed to check sentiment alert:', err);
      return { triggered: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, [settings, isQuietHours, threshold, consecutiveRequired]);

  const getRecentAlerts = useCallback(async (limit = 10) => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'sentiment_alert')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data?.map(entry => ({
        id: entry.id,
        contactId: entry.entity_id,
        createdAt: entry.created_at,
        ...((entry.details || {}) as Record<string, unknown>),
      })) || [];
    } catch (err) {
      log.error('Failed to fetch recent alerts:', err);
      return [];
    }
  }, []);

  return {
    checkAndTriggerAlert,
    getRecentAlerts,
    threshold,
    consecutiveRequired,
    alertsEnabled,
  };
}
