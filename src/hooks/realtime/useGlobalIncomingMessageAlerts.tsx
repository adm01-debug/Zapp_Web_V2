/**
 * Aviso de mensagem nova em QUALQUER tela do app.
 *
 * Até aqui o único lugar que avisava era a inbox: quem estava em outra view
 * (dashboard, contatos, configurações) com a aba em segundo plano não recebia
 * som nem notificação de uma conversa que estava esperando resposta. Este hook
 * é montado uma vez em `App.tsx` (`DeferredProviders`, ao lado de
 * `TeamChatNotificationsListener`) e escuta a mesma tabela `messages` que a
 * inbox.
 *
 * Quem avisa, se a conversa é minha, se a aba está visível e se a mensagem já
 * foi avisada por outro consumidor é decidido em UM lugar só —
 * `useRealtimeNotifications.notifyAboutIncomingMessage` (com
 * `incomingAlertScope` + `openConversationStore` + `lib/notificationDedupe`).
 * Este arquivo não repete nenhuma dessas regras: se repetisse, a regra voltaria
 * a valer num canal só.
 */
import { useCallback } from 'react';
import { getLogger } from '@/lib/logger';
import { RealtimeService } from '@/services/realtime.service';
import { toast } from '@/hooks/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { openContactChat } from '@/components/catalog/useSendProduct';
import type { ConversationContact, RealtimeMessage } from '../chat/useRealtimeMessages';
import { normalizeMessage } from './realtimeUtils';
import { usePublishIncomingAlertIdentity } from './incomingAlertScope';
import { useRealtimeNotifications } from './useRealtimeNotifications';
import { useSupabaseRealtime } from './useSupabaseRealtime';

const log = getLogger('GlobalIncomingMessageAlerts');

/**
 * Mesmo canal físico da inbox de propósito: `useSupabaseRealtime` compartilha
 * uma única subscription por (canal, schema, tabela, filtro) e cada mensagem
 * chega uma vez para os dois consumidores — abrir um segundo canal para a mesma
 * tabela dobraria o tráfego do Realtime sem necessidade.
 */
export const GLOBAL_MESSAGE_ALERTS_CHANNEL = 'global-messages-realtime';

export interface GlobalIncomingMessageAlertsOptions {
  /** Desliga o consumidor global (padrão: ligado). */
  enabled?: boolean;
  /**
   * `profiles.id` de quem está logado — o mesmo valor de `contacts.assigned_to`.
   * Quem monta o consumidor passa o valor que já tem em mãos (`App.tsx` o lê de
   * `useAuth()`): assim este hook não exige AuthProvider nem contexto próprio.
   */
  myProfileId?: string | null;
}

export function useGlobalIncomingMessageAlerts({
  enabled = true,
  myProfileId = null,
}: GlobalIncomingMessageAlertsOptions = {}): void {
  // Este consumidor PUBLICA a identidade para a decisão de aviso
  // (`incomingAlertScope`), que é lida também pelo caminho da inbox.
  usePublishIncomingAlertIdentity(myProfileId);
  const { notifyAboutIncomingMessage } = useRealtimeNotifications();

  const announce = useCallback(
    async (message: RealtimeMessage) => {
      if (!message?.contact_id) return;
      // Filtro barato antes da consulta: mensagem nossa (envio) ou já lida não
      // merece aviso nem uma ida ao banco.
      if (message.sender !== 'contact' || message.is_read) return;

      let contact: ConversationContact | undefined;
      try {
        [contact] = await RealtimeService.fetchContactsByIds([message.contact_id]);
      } catch (error) {
        // Sem o contato não há nome nem responsável: o aviso é descartado, mas
        // a mensagem segue na lista (a inbox tem o próprio caminho de dados).
        log.error('Falha ao buscar o contato do aviso global:', error);
        return;
      }
      if (!contact) return;

      // `true` = este é o consumidor dono do aviso desta mensagem.
      const emitted = notifyAboutIncomingMessage(contact, message);
      if (!emitted) return;

      toast({
        title: `Nova mensagem de ${contact.name}`,
        description: message.content?.trim() || 'Mídia ou anexo sem texto',
        action: (
          <ToastAction
            altText="Abrir a conversa"
            onClick={() => openContactChat(contact.id)}
          >
            Ver conversa
          </ToastAction>
        ),
      });
    },
    [notifyAboutIncomingMessage]
  );

  useSupabaseRealtime<RealtimeMessage>({
    channelName: GLOBAL_MESSAGE_ALERTS_CHANNEL,
    table: 'messages',
    enabled,
    onInsert: (payload) => {
      void announce(normalizeMessage(payload.new as RealtimeMessage));
    },
  });
}
