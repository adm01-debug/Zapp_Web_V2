import { useState, useCallback, useRef, useEffect } from 'react';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import type { ConversationContact, RealtimeMessage, NewMessageNotification } from '../chat/useRealtimeMessages';
import { claimNotificationEvent } from '@/lib/notificationDedupe';
import { getOpenConversationId, isConversationOpenOnScreen, setOpenConversationId } from './openConversationStore';
import { shouldAlertIncomingMessage } from './incomingAlertScope';

/**
 * Nome do lock entre abas. Só a aba que consegue segurá-lo toca o som e mostra o aviso do
 * navegador — as outras seguem alimentando o aviso em tela.
 *
 * NÃO reusa `src/lib/calls/tabLeaderStore`: aquele store é da sessão de CHAMADAS (canal
 * `zapp-call-session` e lock `zapp.call.tab-leader` próprios). Amarrar o aviso de mensagem à
 * eleição da telefonia faria o som do inbox parar quando a aba de chamadas caísse.
 */
export const NOTIFICATION_LEADER_LOCK = 'zapp-notificacao-aviso';

/** Mínimo do Web Locks usado aqui (o `navigator.locks` completo não existe em todo alvo). */
interface LocksApi {
  request(name: string, callback: () => Promise<unknown>): Promise<unknown>;
}

function notificationLocks(): LocksApi | null {
  const locks =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { locks?: LocksApi }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

/**
 * Eleição de aba líder para som e aviso do navegador, com o Web Locks do navegador: a primeira
 * aba segura o lock enquanto viver e a segunda espera na fila; quando a líder fecha (ou recarrega),
 * a seguidora assume e volta a alertar. Sem Web Locks (navegador antigo, jsdom) não há coordenação
 * possível: esta aba é a única e toca — degradar o alerta em silêncio é o pior resultado.
 *
 * O lock é pedido na montagem porque exige só a POSSE, nenhum gesto do usuário — diferente da
 * permissão de notificação, que só sai do botão das configurações (`NotificationSettingsPanel`).
 */
function useNotificationLeader(): boolean {
  const [isLeader, setIsLeader] = useState(() => notificationLocks() === null);
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const locks = notificationLocks();
    if (!locks) return;
    let desmontada = false;
    void locks
      .request(NOTIFICATION_LEADER_LOCK, async () => {
        // A aba desmontou enquanto esperava na fila: devolve o lock na hora em vez de assumir.
        if (desmontada) return;
        setIsLeader(true);
        await new Promise<void>((resolve) => {
          releaseRef.current = resolve;
        });
      })
      .catch(() => {
        // Lock indisponível ou negado: não há como coordenar, então esta aba alerta.
        if (!desmontada) setIsLeader(true);
      });
    return () => {
      desmontada = true;
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, []);

  return isLeader;
}

export function useRealtimeNotifications() {
  const [newMessageNotification, setNewMessageNotification] = useState<NewMessageNotification | null>(null);
  const lastSelectedContactIdRef = useRef<string | null>(null);
  const soundEnabledRef = useRef(true);
  const { settings: notifSettings, isQuietHours } = useNotificationSettings();
  const isLeaderTab = useNotificationLeader();

  // O ref espelha SÓ `soundEnabled`. O horário de silêncio é avaliado AO VIVO, no ponto de
  // uso: congelá-lo aqui (como era) prendia o valor do mount — numa aba aberta o beep
  // continuava tocando depois de a janela de silêncio abrir, porque nada neste efeito
  // muda com o relógio.
  useEffect(() => {
    soundEnabledRef.current = notifSettings.soundEnabled;
  }, [notifSettings.soundEnabled]);

  // A permissão de notificação NÃO é pedida aqui: navegador exige gesto do usuário, e pedir na
  // montagem (como era) queima a permissão sem o usuário saber. Quem pede é o botão das
  // Configurações de Notificações (`src/components/notifications/NotificationSettingsPanel.tsx`),
  // no clique.

  /**
   * Emite o aviso e devolve `true` quando foi ESTA instância que o emitiu.
   *
   * Duas instâncias escutam a mesma mensagem (o inbox e o aviso global montado
   * em `App.tsx`/DeferredProviders): `claimNotificationEvent` garante UM aviso
   * por mensagem, e o consumidor que recebeu `true` é o dono daquele evento — é
   * ele que mostra o toast, sem duplicar.
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

      // O som de mensagem exige o par que os irmãos já exigiam (useSLANotifications:54 com
      // `slaBreachSound`, useSentimentAlerts:77 com `mentionSound`): a chave GLOBAL de som E o
      // controle do EVENTO. `newMessageSound` era o único dos três controles de "Tipos de
      // Notificação" que nenhum consumidor lia — desligá-lo não silenciava nada. Ele governa o
      // SOM (como os dois irmãos); o aviso em tela segue `browserNotifications`/`soundEnabled`.
      if (soundEnabledRef.current && notifSettings.newMessageSound && !isQuietHours()) {
        playNotificationSound('message', notifSettings.messageSoundType, notifSettings.soundVolume);
        alerted = true;
      }

      if (isLeaderTab && notifSettings.browserNotifications && !isQuietHours()) {
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
      isLeaderTab,
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
    // global, montado em App.tsx/DeferredProviders, precisa dela no instante do evento.
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
