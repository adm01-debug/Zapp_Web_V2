/**
 * Paridade V3 -> V2 (auditoria 11/10/2026, parte 1 do chat) — integração no ChatPanel.
 *
 * Prova que os DOIS componentes novos estão MONTADOS no painel, entre a busca e a área de
 * mensagens: com fila + falhas o resumo e o aviso aparecem; sem pendência nada é renderizado.
 * Só as dependências ao redor viram fachadas — `ConversationDeliverySummary` e `SendErrorBanner`
 * são os componentes REAIS.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Conversation, Message } from '@/types/chat';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => ({
      on: function () { return this; },
      subscribe: function () { return this; },
      track: async () => 'ok',
      untrack: async () => 'ok',
      unsubscribe: () => {},
    }),
    removeChannel: vi.fn(),
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }) },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/hooks/chat/useTypingPresence', () => ({
  useTypingPresence: () => ({
    isContactTyping: false,
    isColleagueTyping: false,
    typingUsers: [],
    handleTypingStart: vi.fn(),
    handleTypingStop: vi.fn(),
  }),
}));

// ---- dependências internas do ChatPanel (precedente: ChatPanel.typing-presence) ----
vi.mock('@/components/inbox/useChatMediaSending', () => ({
  useChatMediaSending: () => ({
    instanceName: '', initResolve: vi.fn(), handleSendSticker: vi.fn(),
    handleSendCustomEmoji: vi.fn(), handleSendAudioMeme: vi.fn(),
  }),
}));
vi.mock('@/components/inbox/CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('@/components/inbox/chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('@/components/inbox/chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('@/components/inbox/chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('@/components/inbox/chat/ChatInputArea', () => ({ ChatInputArea: () => null }));
vi.mock('@/components/inbox/chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('@/components/inbox/chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('@/components/inbox/chat/ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('@/components/inbox/chat/ChatDialogs', () => ({ ChatDialogs: () => null }));
vi.mock('@/components/inbox/chat/useChatPanelHandlers', () => ({
  useChatPanelHandlers: () => ({
    inputValue: '', inputRef: { current: null }, isSending: false, isRecordingAudio: false,
    replyToMessage: null, editingMessage: null, forwardMessage: null,
    setInputValue: vi.fn(), handleReplyToMessage: vi.fn(), handleForwardMessage: vi.fn(),
    handleCopyMessage: vi.fn(), handleInteractiveButtonClick: vi.fn(), handleEditStart: vi.fn(),
    handleInputChange: vi.fn(), handleKeyDown: vi.fn(), handleCancelEdit: vi.fn(),
    handleSlashCommand: vi.fn(), handleAudioSend: vi.fn(), handleSend: vi.fn(),
    handleSendInteractiveMessage: vi.fn(), handleForwardToTargets: vi.fn(), handleSendLocation: vi.fn(),
    handleTypingStart: vi.fn(), handleTypingStop: vi.fn(),
  }),
}));
vi.mock('@/components/inbox/WhisperMode', () => ({ WhisperMode: () => null }));
vi.mock('@/components/inbox/NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('@/components/inbox/TransferDialog', () => ({ default: () => null }));
vi.mock('@/components/inbox/AIConversationAssistant', () => ({ default: () => null }));
vi.mock('@/components/inbox/CloseConversationDialog', () => ({ default: () => null }));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({ useEvolutionApi: () => ({ editMessage: vi.fn() }) }));
vi.mock('@/hooks/chat/useQuickReplies', () => ({ useQuickReplies: () => ({ quickReplies: [], incrementUseCount: vi.fn() }) }));
vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false,
    currentMessageId: null, voiceId: '', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
  }),
}));
vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({ settings: {}, updateSettings: vi.fn(), saveSettings: vi.fn() }),
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/chat/useScheduledMessages', () => ({
  useScheduledMessages: () => ({ messages: [], isLoading: false, scheduleMessage: vi.fn(), cancelMessage: vi.fn(), isScheduling: false }),
}));
vi.mock('@/hooks/chat/useMessageSignature', () => ({
  useMessageSignature: () => ({ signatureEnabled: false, agentName: '', toggleSignature: vi.fn(), applySignature: vi.fn() }),
}));
vi.mock('@/hooks/ui/useAmbientColor', () => ({ useAmbientColor: () => ({ className: '', bgTint: undefined }) }));
vi.mock('@/lib/calls/events', () => ({ dispatchStartCall: vi.fn() }));
vi.mock('@/components/inbox/chat/MessageBubble', () => ({
  MessageBubble: ({ message, highlightedMessageIds, activeHighlightId }: {
    message: { id: string };
    highlightedMessageIds?: Set<string>;
    activeHighlightId?: string | null;
  }) => (
    <div
      data-testid="bubble"
      data-message-id={message.id}
      data-realce={
        activeHighlightId === message.id
          ? 'ativo'
          : highlightedMessageIds?.has(message.id)
            ? 'sim'
            : undefined
      }
    />
  ),
}));
const areaCtrl = vi.hoisted(() => ({ scrollToMessage: vi.fn(), scrollToBottom: vi.fn() }));

// A área de mensagens não é o objeto do cartão: vira fachada (com ref imperativa real) e expõe o
// realce que o painel manda para cada bolha. Assim prova-se o caminho pílula -> scroll + anel.
vi.mock('@/components/inbox/chat/ChatMessagesArea', async () => {
  const React = await import('react');
  type Props = {
    messages: Array<{ id: string }>;
    highlightedMessageIds?: Set<string>;
    activeHighlightId?: string | null;
  };
  const Fachada = React.forwardRef<{ scrollToMessage: (id: string) => void; scrollToBottom: () => void }, Props>(
    ({ messages, highlightedMessageIds, activeHighlightId }, ref) => {
      React.useImperativeHandle(ref, () => ({ scrollToMessage: areaCtrl.scrollToMessage, scrollToBottom: areaCtrl.scrollToBottom }), []);
      return (
        <div data-testid="area-mensagens">
          {messages.map((m) => (
            <div
              key={m.id}
              data-testid="bubble"
              data-message-id={m.id}
              data-realce={
                activeHighlightId === m.id
                  ? 'ativo'
                  : highlightedMessageIds?.has(m.id)
                    ? 'sim'
                    : undefined
              }
            />
          ))}
        </div>
      );
    },
  );
  Fachada.displayName = 'ChatMessagesAreaFachada';
  return { ChatMessagesArea: Fachada };
});

vi.mock('@/components/inbox/TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('@/services/realtime.service', () => ({
  RealtimeService: { subscribeToReactions: vi.fn(() => ({})), removeChannel: vi.fn() },
}));
vi.mock('@/services/chat.service', () => ({
  ChatService: { deleteMessage: vi.fn(async () => undefined) },
}));

import { ChatPanel } from '../../ChatPanel';

const conversation = {
  id: 'conv-1',
  contact: { id: 'contato-1', name: 'Maria Silva', phone: '+5511999994321', avatar: '' },
  assignedTo: { id: 'user-1', name: 'Ana Souza' },
  sentiment: null,
  messages: [],
} as unknown as Conversation;

function msg(over: Partial<Message> = {}): Message {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    content: '',
    sender: 'agent',
    timestamp: new Date('2026-10-11T10:00:00.000Z'),
    type: 'text',
    created_at: '2026-10-11T10:00:00.000Z',
    status: 'sending',
    ...over,
  } as Message;
}

function renderPanel(messages: Message[], onSendMessage: (content: string) => void = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPanel conversation={conversation} messages={messages} onSendMessage={onSendMessage} />
    </QueryClientProvider>,
  );
}

describe('ChatPanel — resumo de entrega e aviso de não enviada (paridade V3)', () => {
  it('sem falha e sem fila não renderiza o resumo nem o aviso', () => {
    renderPanel([msg({ status: 'delivered' }), msg({ status: 'read' })]);
    expect(screen.queryByTestId('conversation-delivery-summary')).toBeNull();
    expect(screen.queryByTestId('send-error-banner')).toBeNull();
  });

  it('com fila e falhas mostra os dois e "Enviar de novo" chama onSendMessage com o texto', async () => {
    const onSendMessage = vi.fn();
    renderPanel(
      [
        msg({ id: 'q1', status: 'sending', content: 'na fila' }),
        msg({ id: 'f1', status: 'failed', content: 'primeira', created_at: '2026-10-11T10:00:01.000Z' }),
        msg({ id: 'f2', status: 'failed', content: 'segunda', created_at: '2026-10-11T10:00:02.000Z' }),
        msg({ id: 'ok', status: 'delivered', content: 'entregue' }),
      ],
      onSendMessage,
    );

    expect(screen.getByRole('button', { name: /1 na fila/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2 com falha/ })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('2 mensagens não foram enviadas');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar de novo' }));
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith('segunda'));
  });

  it('clicar na pílula de falha realça a primeira mensagem naquele estado', () => {
    renderPanel([
      msg({ id: 'f1', status: 'failed', content: 'primeira', created_at: '2026-10-11T10:00:01.000Z' }),
      msg({ id: 'f2', status: 'failed', content: 'segunda', created_at: '2026-10-11T10:00:02.000Z' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: '2 com falha' }));

    expect(areaCtrl.scrollToMessage).toHaveBeenCalledWith('f1');
    const bolha = (id: string) => screen.getAllByTestId('bubble').find((b) => b.getAttribute('data-message-id') === id);
    expect(bolha('f1')?.getAttribute('data-realce')).toBe('ativo');
    expect(bolha('f2')?.getAttribute('data-realce')).not.toBe('ativo');
  });

  it('"Dispensar" esconde o aviso mas mantém o resumo da fila', () => {
    renderPanel([
      msg({ id: 'q1', status: 'sending' }),
      msg({ id: 'f1', status: 'failed', content: 'oi', created_at: '2026-10-11T10:00:01.000Z' }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByTestId('send-error-banner')).toBeNull();
    expect(screen.getByTestId('conversation-delivery-summary')).toBeInTheDocument();
  });
});
