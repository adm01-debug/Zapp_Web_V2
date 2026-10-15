import { useState, useCallback, useRef, useEffect } from 'react';
import { playNotificationSound, showBrowserNotification, requestNotificationPermission } from '@/utils/notificationSounds';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import type { ConversationContact, RealtimeMessage, NewMessageNotification } from '../chat/useRealtimeMessages';
import { claimNotificationEvent } from '@/lib/notificationDedupe';
import { getOpenConversationId, isConversationOpenOnScreen, setOpenConversationId } from './openConversationStore';
import { shouldAlertIncomingMessage } from './incomingAlertScope';

export function useRealtimeNotifications() {
  const [newMessageNotification, setNewMessageNotification] = useState<NewMessageNotification | null>(null);
  const lastSelectedContactIdRef = useRef<string | null>(null);
  const soundEnabledRef = useRef(true);
  const { settings: notifSettings, isQuietHours } = useNotificationSettings();

  // O ref espelha SÓ `soundEnabled`. O horário de silêncio é avaliado AO VIVO, no ponto de
  // uso: congelá-lo aqui (como era) prendia o valor do mount — numa aba aberta o beep
  // continuava tocando depois de a janela de silêncio abrir, porque nada neste efeito
  // muda com o relógio.
  useEffect(() => {
    soundEnabledRef.current = notifSettings.soundEnabled;
  }, [notifSettings.soundEnabled]);

  // Request notification permission on mount
  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  /**
   * Emite o aviso e devolve `true` quando foi ESTA instância que o emitiu.
   *
   * Duas instâncias escutam a mesma mensagem (o inbox e o aviso global do
   * AppShell): `claimNotificationEvent` garante UM aviso por mensagem, e o
   * consumidor que recebeu `true` é o dono daquele evento — é ele que mostra o
   * toast, sem duplicar.
   */
  const notifyAboutIncomingMessage = useCallback(
    (contact: ConversationContact, message: RealtimeMessage): boolean => {
      if (message.sender !== 'contact' || message.is_read) return false;

      // Responsável: conversa própria ou sem dono (incomingAlertScope).
      if (!shouldAlertIncomingMessage(contact)) return false;

      // Replay do Realtime com o mesmo id, ou a outra instância já avisou.
      if (!claimNotificationEvent(`incoming-message:${message.id}`)) return false;

      // Conversa aberta na tela com a aba visível: o usuário está lendo ali.
      if (isConversationOpenOnScreen(message.contact_id)) return false;

      const notificationsActive = notifSettings.soundEnabled || notifSettings.browserNotifications;
      if (!notificationsActive && isQuietHours()) return false;

      // `alerted` é o contrato de saída: `true` = ESTA instância emitiu aviso
      // (som, notificação de navegador ou toast). Quem recebe `true` é o dono do
      // aviso e pode mostrar o toast global, sem repetir o que ninguém emitiu —
      // em horário de silêncio e com tudo desligado, nada sai e ninguém mostra.
      let alerted = false;

      // O som de mensagem exige o par que os irmãos já exigiam (useSLANotifications:54 com
      // `slaBreachSound`, useSentimentAlerts:77 com `mentionSound`): a chave GLOBAL de som E o
      // controle do EVENTO. `newMessageSound` era o único dos três controles de "Tipos de
      // Notificação" que nenhum consumidor lia — desligá-lo não silenciava nada. Ele governa o
      // SOM (como os dois irmãos); o aviso em tela segue `browserNotifications`/`soundEnabled`.
      if (soundEnabledRef.current && notifSettings.newMessageSound && !isQuietHours()) {
        playNotificationSound('message', notifSettings.messageSoundType, notifSettings.soundVolume);
        alerted = true;
      }

      if (notifSettings.browserNotifications && !isQuietHours()) {
        showBrowserNotification(
          `Nova mensagem de ${contact.name}`,
          message.content,
          { icon: contact.avatar_url || undefined }
        );
        alerted = true;
      }

      if (notificationsActive && !isQuietHours()) {
        setNewMessageNotification({
          id: message.id,
          contactId: contact.id,
          contactName: contact.name,
          contactAvatar: contact.avatar_url,
          message: message.content,
          timestamp: new Date(),
        });
        alerted = true;
      }

      return alerted;
    },
    [
      notifSettings.soundEnabled,
      notifSettings.newMessageSound,
      notifSettings.browserNotifications,
      notifSettings.messageSoundType,
      notifSettings.soundVolume,
      isQuietHours,
    ]
  );

  const dismissNotification = useCallback(() => setNewMessageNotification(null), []);

  const setSelectedContact = useCallback((contactId: string | null) => {
    lastSelectedContactIdRef.current = contactId;
    // A seleção vive FORA do React (openConversationStore) porque o aviso
    // global, montado no AppShell, precisa dela no instante do evento.
    setOpenConversationId(contactId);
  }, []);

  // Ao desmontar (sair do inbox) a conversa aberta deixa de existir. Só limpa
  // se a seleção ainda for a DESTA instância: o aviso global nunca seleciona
  // nada e, ao desmontar, não pode apagar a seleção do inbox.
  useEffect(
    () => () => {
      const last = lastSelectedContactIdRef.current;
      if (last && getOpenConversationId() === last) setOpenConversationId(null);
    },
    []
  );

  const setSoundEnabled = useCallback((enabled: boolean) => {
    soundEnabledRef.current = enabled;
  }, []);

  return {
    newMessageNotification,
    notifyAboutIncomingMessage,
    dismissNotification,
    setSelectedContact,
    setSoundEnabled,
    notifSettings,
    isQuietHours,
  };
}
