/**
 * "Ver na conversa" — da aba Arquivos para a mensagem na aba Chat.
 *
 * Cada arquivo É uma linha de `messages` (`ContactMediaItem.id` = id da mensagem), mas a aba
 * Arquivos não tem o virtualizador do chat. Este cartão cria uma ponte: a aba entrega o
 * `messageId`, o `ConversationTabContent` troca para a aba Chat e o `ChatPanel` — que conhece o
 * `ChatMessagesArea` — rola até a mensagem, reusando o MESMO destaque da busca do chat
 * (`highlightedMessageIds`/`activeHighlightId`, consumidos pelo `MessageBubble`).
 *
 * Prova (renderiza os componentes REAIS): o `ChatMessagesArea` é substituído por um observador
 * que expõe `scrollToMessage` e imprime as props de destaque que o ChatPanel passa — nada além
 * disso é mockado no caminho sob teste.
 */
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatPanel } from '../ChatPanel';
import { ConversationTabContent } from '../chat/ConversationTabContent';
import type { ConversationTab } from '../chat/ConversationTabs';
import { FileCard } from '../tabs/FileCard';
import { FileDetailContent } from '../tabs/FileDetailPanel';
import type { Conversation, Message } from '@/types/chat';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  toastError: vi.fn(),
  logStub: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  area: { scrollToMessage: vi.fn(), scrollToBottom: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  // Cadeia tolerante: qualquer encadeamento (`select().eq().order().limit()`) resolve vazio.
  // Sem isto, um consumidor fora do caminho sob prova (ex.: NextBestAction) deixa rejeição não
  // tratada e o run acusa erro que não é do cartão.
  const consulta: unknown = new Proxy({}, {
    get: (_alvo, prop) => {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
      if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: null, error: null });
      return () => consulta;
    },
  });
  return {
    supabase: {
      rpc: () => consulta,
      from: () => consulta,
      storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: null }), remove: vi.fn() }) },
    },
  };
});

vi.mock('@/lib/logger', () => ({
  log: mocks.logStub,
  logger: mocks.logStub,
  getLogger: () => mocks.logStub,
  generateCorrelationId: () => 'corr-test',
  getSessionId: () => 'sessao-test',
  logPerformance: (_l: string, fn: () => void) => fn(),
  logAsyncPerformance: async (_l: string, fn: () => Promise<unknown>) => fn(),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

// A URL de leitura do download não participa da ação em prova.
vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: () => ({ url: 'https://exemplo.invalido/arquivo.png', isLoading: false, error: null, refresh: vi.fn() }),
}));

// Peças visuais do cartão/painel sem relação com a ação: só o mínimo para renderizar.
vi.mock('../tabs/FileThumb', () => ({ FileThumb: () => <div data-testid="thumb" /> }));
vi.mock('../tabs/FileActionsMenu', () => ({ FileActionsMenu: () => null }));
vi.mock('../tabs/SenderAvatar', () => ({ SenderAvatar: () => <span data-testid="sender-avatar" /> }));

// Observador do caminho real: o ChatPanel chama `scrollToMessage` nesta ref e passa o destaque.
vi.mock('../chat/ChatMessagesArea', async () => {
  const React = await import('react');
  const ChatMessagesArea = React.forwardRef((props: { activeHighlightId?: string | null; highlightedMessageIds?: Set<string> }, ref) => {
    React.useImperativeHandle(ref, () => ({
      scrollToMessage: mocks.area.scrollToMessage,
      scrollToBottom: mocks.area.scrollToBottom,
    }));
    return React.createElement('div', {
      'data-testid': 'messages-area',
      'data-active-highlight': props.activeHighlightId ?? '',
      'data-highlighted': Array.from(props.highlightedMessageIds ?? []).join(','),
    });
  });
  return { ChatMessagesArea };
});

// A aba Arquivos é injetada com os botões reais da nova ação (o FilesTab em si tem os seus testes).
vi.mock('../tabs/FilesTab', () => ({
  FilesTab: ({ onOpenInChat }: { onOpenInChat?: (messageId: string) => void }) => (
    <div data-testid="files-tab-mock">
      <button type="button" data-testid="abrir-m1" onClick={() => onOpenInChat?.('m1')}>Ver na conversa m1</button>
      <button type="button" data-testid="abrir-m2" onClick={() => onOpenInChat?.('m2')}>Ver na conversa m2</button>
    </div>
  ),
}));

// Dependências do ChatPanel fora do caminho sob prova (mesmo contrato do teste de atalhos).
vi.mock('@/hooks/chat/useTypingPresence', () => ({
  useTypingPresence: () => ({ isContactTyping: false, typingUsers: [], handleTypingStart: vi.fn(), handleTypingStop: vi.fn() }),
}));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({ useEvolutionApi: () => ({ editMessage: vi.fn() }) }));
vi.mock('@/hooks/chat/useQuickReplies', () => ({ useQuickReplies: () => ({ quickReplies: [], incrementUseCount: vi.fn() }) }));
vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false, currentMessageId: null,
    voiceId: '', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
  }),
}));
vi.mock('@/hooks/system/useUserSettings', () => ({ useUserSettings: () => ({ settings: {}, updateSettings: vi.fn(), saveSettings: vi.fn() }) }));
vi.mock('@/hooks/chat/useScheduledMessages', () => ({
  useScheduledMessages: () => ({ messages: [], isLoading: false, scheduleMessage: vi.fn(), cancelMessage: vi.fn(), isScheduling: false }),
}));
vi.mock('@/hooks/chat/useMessageSignature', () => ({
  useMessageSignature: () => ({ signatureEnabled: false, agentName: '', toggleSignature: vi.fn(), applySignature: (t: string) => t }),
}));
vi.mock('../useChatMediaSending', () => ({
  useChatMediaSending: () => ({ instanceName: '', initResolve: vi.fn(), handleSendSticker: vi.fn(), handleSendCustomEmoji: vi.fn(), handleSendAudioMeme: vi.fn() }),
}));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({ isFavorite: () => false, favoriteContact: vi.fn(), unfavoriteContact: vi.fn(), snoozeConversation: vi.fn() }),
}));
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: () => ({ createAndGetId: async () => null }),
  tomorrowAtNine: () => new Date(),
}));
vi.mock('@/hooks/ui/useAmbientColor', () => ({ useAmbientColor: () => ({ className: '', bgTint: undefined }) }));
vi.mock('@/lib/calls/events', () => ({ dispatchStartCall: vi.fn() }));

vi.mock('../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../chat/ChatDialogs', () => ({ ChatDialogs: () => null }));
vi.mock('../chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('../chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('../chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('../chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('../WhisperMode', () => ({ WhisperMode: () => null }));

const conversation = {
  id: 'conv-1',
  contact: { id: 'contato-1', name: 'Maria Silva', phone: '+55119****9999', avatar: '' },
  assignedTo: { name: 'Agente' },
} as unknown as Conversation;

function mensagem(id: string): Message {
  return {
    id,
    content: 'arquivo',
    timestamp: new Date('2026-10-10T12:00:00Z'),
    sender: 'contact',
    type: 'image',
  } as unknown as Message;
}

const arquivo = {
  id: 'm2',
  url: 'https://exemplo.invalido/arquivo.png',
  type: 'image',
  filename: 'foto.png',
  displayName: 'foto.png',
  extension: 'png',
  senderLabel: null,
  created_at: '2026-10-10T12:00:00Z',
  caption: null,
  mimetype: 'image/png',
  size: 1024,
  meta: null,
  sender: 'contact',
} as ContactMediaItem;

/** Aba controlada: troca de aba de verdade, como o RealtimeInboxView faz. */
function Harness({ messages }: { messages: Message[] }) {
  const [aba, setAba] = useState<ConversationTab>('files');
  return (
    <TooltipProvider>
      <ConversationTabContent
        activeTab={aba}
        onTabChange={setAba}
        conversation={conversation}
        messages={messages}
      >
        <ChatPanel conversation={conversation} messages={messages} onSendMessage={vi.fn()} />
      </ConversationTabContent>
    </TooltipProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Ver na conversa — aba Arquivos leva à mensagem na aba Chat', () => {
  it('O clique leva à mensagem certa, já em destaque, e troca para a aba Chat', async () => {
    render(<Harness messages={[mensagem('m1'), mensagem('m2')]} />);

    fireEvent.click(await screen.findByTestId('abrir-m2'));

    // Rolou até a mensagem EXATA do arquivo (não a primeira, não outra).
    await waitFor(() => expect(mocks.area.scrollToMessage).toHaveBeenCalledWith('m2'));
    expect(mocks.area.scrollToMessage).toHaveBeenCalledTimes(1);

    // Reusa o destaque da busca do chat para a mesma mensagem.
    const area = screen.getByTestId('messages-area');
    expect(area).toHaveAttribute('data-active-highlight', 'm2');
    expect(area).toHaveAttribute('data-highlighted', 'm2');

    // Troca de aba: a aba Arquivos saiu de cena.
    expect(screen.queryByTestId('files-tab-mock')).not.toBeInTheDocument();
  });

  it('Arquivo cuja mensagem não existe mais mostra aviso e não troca de aba', async () => {
    render(<Harness messages={[]} />);

    fireEvent.click(await screen.findByTestId('abrir-m1'));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'Mensagem não encontrada',
      expect.objectContaining({ description: expect.any(String) }),
    ));
    expect(mocks.area.scrollToMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId('files-tab-mock')).toBeInTheDocument();
  });
});

describe('Ver na conversa — a ação existe no cartão da grade e no painel de detalhes', () => {
  it('Cartão da grade chama o handler do arquivo', () => {
    const onOpenInChat = vi.fn();
    render(
      <FileCard
        item={arquivo}
        contactName="Maria Silva"
        selected={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        onForward={vi.fn()}
        onRequestDelete={vi.fn()}
        onOpenInChat={onOpenInChat}
      />,
    );

    fireEvent.click(screen.getByLabelText('Ver na conversa'));

    expect(onOpenInChat).toHaveBeenCalledTimes(1);
  });

  it('Painel de detalhes (usado pelos modos lista e grade) oferece a ação', () => {
    const onOpenInChat = vi.fn();
    render(
      <FileDetailContent
        item={arquivo}
        contactName="Maria Silva"
        onForward={vi.fn()}
        onOpenInChat={onOpenInChat}
        onClose={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ver na conversa/ }));

    expect(onOpenInChat).toHaveBeenCalledTimes(1);
  });
});
