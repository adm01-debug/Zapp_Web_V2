import { lazy, Suspense, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { getLogger } from '@/lib/logger';
import { useMessages } from '@/hooks/chat/useMessages';
import { ChatService } from '@/services/chat.service';
import { sendMessageToContact } from '@/hooks/realtime/messageSender';
import { mapRealtimeConversationToConversation } from '@/adapters/inboxAdapter';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

const log = getLogger('OmnichannelChatPanel');

// Reaproveita EXATAMENTE o mesmo painel de chat do módulo inbox (carregado sob
// demanda, igual à Inbox): nada de cópia da UI de mensagens. O que este wrapper
// monta é só a liga de dados para uma única conversa — `useMessages` (mesmo hook
// de histórico/paginação/realtime da Inbox) e `sendMessageToContact` (mesmo
// transporte de envio). Sem estado do Inbox normal, sem canal duplicado.
const ChatPanel = lazy(() => import('@/components/inbox/ChatPanel').then((m) => ({ default: m.ChatPanel })));

const ChatFallback = () => (
  <div className="flex flex-1 items-center justify-center">
    <Loader2 className="h-6 w-6 motion-safe:animate-spin text-primary" aria-hidden="true" />
  </div>
);

interface OmnichannelChatPanelProps {
  /** Conversa selecionada na lista do Omnichannel (mesma projeção canônica). */
  conversation: ConversationWithMessages;
  /** Fecha o painel embutido (volta para a lista no celular; limpa a seleção no desktop). */
  onClose: () => void;
}

/**
 * Painel de chat embutido no Omnichannel Inbox.
 *
 * A conversa já vem projetada pela lista; o histórico e o envio usam as mesmas
 * peças do módulo inbox, então o comportamento (envio, recebimento por realtime,
 * paginação do histórico) é idêntico ao da Inbox normal, com uma fonte só.
 */
export function OmnichannelChatPanel({ conversation, onClose }: OmnichannelChatPanelProps) {
  const contactId = conversation.contact.id;
  const { messages, loadingOlder, hasOlder, refetch, loadOlderMessages } = useMessages({
    contactId,
    enabled: Boolean(contactId),
  });

  const legacyConversation = useMemo(
    () => mapRealtimeConversationToConversation(conversation),
    [conversation],
  );

  const handleSendMessage = useCallback(
    async (content: string, replyToId?: string | null) => {
      await sendMessageToContact(contactId, content, 'text', undefined, undefined, replyToId ?? null);
      // O transporte já confirmou o envio: falha do refetch não pode sugerir ao
      // agente que reenvie a mesma mensagem.
      try {
        await refetch();
      } catch (err) {
        log.warn('Mensagem enviada, mas o refresh da conversa falhou', err);
      }
    },
    [contactId, refetch],
  );

  const handleSendAudio = useCallback(
    async (blob: Blob): Promise<boolean> => {
      try {
        const audioUrl = await ChatService.uploadAudio(contactId, blob);
        await sendMessageToContact(contactId, '[Áudio]', 'audio', audioUrl);
        return true;
      } finally {
        try {
          await refetch();
        } catch (err) {
          log.warn('Envio de áudio concluído, mas o refresh da conversa falhou', err);
        }
      }
    },
    [contactId, refetch],
  );

  return (
    <SectionErrorBoundary sectionName="Chat Omnichannel" className="h-full min-h-0">
      <Suspense fallback={<ChatFallback />}>
        <ChatPanel
          key={legacyConversation.id}
          conversation={legacyConversation}
          messages={messages}
          onSendMessage={handleSendMessage}
          onSendAudio={handleSendAudio}
          onBack={onClose}
          hasOlderMessages={hasOlder}
          loadingOlderMessages={loadingOlder}
          onLoadOlderMessages={loadOlderMessages}
        />
      </Suspense>
    </SectionErrorBoundary>
  );
}
