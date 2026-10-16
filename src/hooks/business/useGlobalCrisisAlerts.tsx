import { useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { playNotificationSound } from '@/utils/notificationSounds';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { useNotificationSettings } from '../system/useNotificationSettings';
import { useUserRole } from '../system/useUserRole';
import { announceWarRoomAlert, isWarRoomListenerMounted, type WarRoomAlertNoticeInput } from './warRoomAlertNotice';

/**
 * Ouvinte GLOBAL do alerta de crise.
 *
 * O alerta do War Room só existia dentro da tela: `WarRoomDashboard` montava o
 * `useWarRoomAlerts` e quem estava em Contatos, Inbox ou Relatórios não via nem
 * ouvia a violação de SLA — o alerta ficava parado no banco até alguém abrir a
 * War Room. Aqui o INSERT em `warroom_alerts` é ouvido no shell do app, para
 * quem é da SUPERVISÃO (`isSupervisor` = admin ou supervisor, o mesmo critério
 * da navegação da War Room): som (respeitando mudo e horário de silêncio),
 * notificação do navegador e toast com ação para abrir a War Room.
 *
 * O atendente NÃO é avisado: o canal só é aberto quando o papel é de staff, e o
 * alerta é da operação inteira — não da conversa dele.
 *
 * O aviso em si passa pelo `announceWarRoomAlert`, que deduplica por alerta
 * (e, entre abas, só a aba vencedora da reivindicação).
 *
 * Com a War Room ABERTA este ouvinte se cala: a própria tela anuncia, para o
 * mudo explícito do painel (`useWarRoomAlerts(soundEnabled)`) valer — senão o
 * global venceria a disputa e o som sairia mesmo com o painel mudo.
 */
export function useGlobalCrisisAlerts(): null {
  const { isSupervisor } = useUserRole();
  const { settings, isQuietHours } = useNotificationSettings();

  const anunciar = useCallback(
    (alerta: WarRoomAlertNoticeInput) => {
      const critico = alerta.alert_type === 'critical';
      void announceWarRoomAlert(alerta, {
        soundEnabled: settings.soundEnabled,
        quietHours: isQuietHours(),
        browserNotifications: settings.browserNotifications,
        playSound: () =>
          playNotificationSound(
            critico ? 'sla_breach' : 'sla_warning',
            settings.slaSoundType,
            settings.soundVolume,
          ),
      });
    },
    [settings, isQuietHours],
  );

  useEffect(() => {
    if (!isSupervisor) return;

    const channel = supabase
      .channel(uniqueRealtimeTopic('warroom-alerts-global'))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'warroom_alerts' },
        (payload) => {
          // War Room aberta: a tela anuncia com o mudo explícito do painel; o
          // global nem reivindica, para não vencer a disputa e tocar mesmo mutado.
          if (isWarRoomListenerMounted()) return;
          anunciar(payload.new as WarRoomAlertNoticeInput);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSupervisor, anunciar]);

  return null;
}
