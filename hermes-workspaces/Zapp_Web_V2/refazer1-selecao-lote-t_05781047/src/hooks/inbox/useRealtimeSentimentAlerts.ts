import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { playNotificationSound } from '@/utils/notificationSounds';
import { showBrowserNotification, requestNotificationPermission } from '@/utils/notificationSounds';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { useAuth } from '@/hooks/auth/useAuth';
import { getLogger } from '@/lib/logger';
import { normalizeScore } from '@/lib/ai-values';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { claimNotificationEvent } from '@/lib/notificationDedupe';
import { openContactChat } from '@/components/catalog/useSendProduct';

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
    // Nota ausente ou inválida fica `null` — nunca 0%, que afirmaria um
    // sentimento que ninguém mediu (IA-023).
    const sentimentScore = normalizeScore(details.sentiment_score, { min: 0, max: 100, scale: 'percent' }).value;
    const consecutiveLow = typeof details.consecutive_low === 'number' ? details.consecutive_low : 0;

    // Show toast notification
    toast.error(
      `⚠️ Alerta de Sentimento: ${contactName}`,
      {
        description: sentimentScore !== null
          ? `Sentimento negativo (${sentimentScore}%) detectado em ${consecutiveLow} análises consecutivas`
          : `Sentimento negativo detectado em ${consecutiveLow} análises consecutivas`,
        duration: 10000,
        action: {
          label: 'Ver conversa',
          // R2-INB-064: o alerta global chegava em qualquer tela e a ação tentava
          // clicar na aba "ai" do Dashboard — que só existe lá e apenas para
          // staff —, então fora do Dashboard o clique não fazia nada. O destino
          // agora é a conversa do contato alertado, pelo mesmo caminho do
          // Catálogo e das chamadas.
          onClick: () => {
            const contactId = details.contact_id;
            if (!contactId) {
              // Alerta sem identidade não tem conversa para abrir: avisar é
              // melhor que um clique mudo.
              toast.info('Este alerta não identifica o contato; abra a conversa pelo Chat.');
              return;
            }
            openContactChat(contactId);
          },
        },
      }
    );

    // Play alert sound if not in quiet hours
    if (!isQuietHours() && settings.soundEnabled) {
      try {
        playNotificationSound('mention', settings.mentionSoundType, settings.soundVolume);
      } catch (err) {
        log.error('Error playing notification sound:', err);
      }
    }

    // Show browser notification
    if (settings.browserNotifications) {
      await requestNotificationPermission();
      showBrowserNotification(
        '⚠️ Alerta de Sentimento Negativo',
        sentimentScore !== null
          ? `${contactName}: Sentimento em ${sentimentScore}% (${consecutiveLow} análises consecutivas)`
          : `${contactName}: Sentimento negativo (${consecutiveLow} análises consecutivas)`,
        { icon: '/favicon.ico' }
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
