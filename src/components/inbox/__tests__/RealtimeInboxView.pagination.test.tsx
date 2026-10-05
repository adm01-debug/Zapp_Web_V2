/**
 * R2-INB-004 (etapa 2/3) — a Inbox ativa tem de entregar o contrato de paginação
 * do hook (`hasOlderMessages` / `loadingOlderMessages` / `loadOlderMessages`) ao
 * controle de histórico da área de mensagens.
 *
 * Antes desta etapa o `useRealtimeInbox` já publicava os três valores
 * (`src/hooks/inbox/useRealtimeInbox.ts:216-218`), mas `RealtimeInboxView.tsx` e
 * `ChatPanel.tsx` os descartavam — a conversa ativa ficava presa nas 1000
 * mensagens iniciais, sem nenhum caminho de UI para o histórico antigo.
 *
 * O teste monta a Inbox ativa REAL (`RealtimeInboxView` -> `ChatPanel` ->
 * `ChatMessagesArea`), com o hook de dados trocado por uma fachada controlada, e
 * prova pelo clique no controle visível que a chamada chega exatamente uma vez ao
 * `inbox.loadOlderMessages` — e que `hasOlderMessages=false` não oferece ação de
 * carga. Só o hook de dados é substituído; o caminho de componentes é o de produção.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Conversation, Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  loadOlderMessages: vi.fn(async () => {}),
  inbox: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/inbox/useRealtimeInbox', () => ({
  useRealtimeInbox: () => mocks.inbox,
}));

// ---- dependências próprias da RealtimeInboxView (nenhuma delas é o alvo) ----
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/ui/usePullToRefresh', () => ({ usePullToRefresh: () => ({}) }));
vi.mock('@/hooks/ui/useGlobalSearchShortcut', () => ({ useGlobalSearchShortcut: vi.fn() }));
vi.mock('@/hooks/inbox/useInboxBulkActions', () => ({
  useInboxBulkActions: () => ({
    selectAll: vi.fn(), selectionMode: false, selectedIds: new Set<string>(),
    bulkArchive: vi.fn(), clearSelection: vi.fn(), bulkMarkAsRead: vi.fn(),
  }),
}));
vi.mock('@/hooks/inbox/useInboxFilters', () => ({
  useInboxFilters: () => ({ filteredConversations: [], setMainTab: vi.fn(), setSubTab: vi.fn() }),
}));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    pinnedIds: new Set<string>(), isFavorite: () => false,
    favoriteContact: vi.fn(), unfavoriteContact: vi.fn(), archiveContact: vi.fn(),
  }),
}));
vi.mock('@/hooks/chat/useConversationTabCounts', () => ({ useConversationTabCounts: () => ({ counts: {} }) }));
vi.mock('@/hooks/crm/useContactCrm360', () => ({ useContactCrm360: () => ({ data: null }) }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));
vi.mock('@/features/talk-me/useTalkMeQueue', () => ({
  useTalkMeQueue: () => ({ queuesError: false, selectedQueue: null, queuesLoading: false }),
}));

// ---- componentes irmãos pesados / lazy (a árvore do chat fica real) ----
vi.mock('@/components/mobile/MiniChatPiP', () => ({ MiniChatPiP: () => null }));
vi.mock('../NewMessageIndicator', () => ({ NewMessageIndicator: () => null }));
vi.mock('../InboxEmptyChat', () => ({ InboxEmptyChat: () => null }));
vi.mock('../ConversationListSidebar', () => ({ ConversationListSidebar: () => null }));
vi.mock('../chat/ConversationTabs', () => ({ ConversationTabs: () => null }));
vi.mock('../chat/ConversationTabContent', () => ({
  ConversationTabContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/talk-me/TalkMeView', () => ({ TalkMeView: () => null }));
vi.mock('../ContactDetails', () => ({ default: () => null }));
vi.mock('../ContactDetailsResponsive', () => ({ default: () => null }));
vi.mock('../GlobalSearch', () => ({ default: () => null }));
vi.mock('../NewConversationModal', () => ({ default: () => null }));

// ---- dependências internas do ChatPanel (precedente: ChatPanel.scheduled-media) ----
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }) }, from: () => ({ update: () => ({ eq: () => ({ error: null }) }) }) },
}));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/hooks/chat/useTypingPresence', () => ({
  useTypingPresence: () => ({ isContactTyping: false, typingUsers: [], handleTypingStart: vi.fn(), handleTypingStop: vi.fn() }),
}));
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
vi.mock('../useChatMediaSending', () => ({
  useChatMediaSending: () => ({ instanceName: '', initResolve: vi.fn(), handleSendSticker: vi.fn(), handleSendCustomEmoji: vi.fn(), handleSendAudioMeme: vi.fn() }),
}));
vi.mock('@/hooks/ui/useAmbientColor', () => ({ useAmbientColor: () => ({ className: '', bgTint: undefined }) }));
vi.mock('@/lib/calls/events', () => ({ dispatchStartCall: vi.fn() }));
vi.mock('../chat/useChatPanelHandlers', () => ({
  useChatPanelHandlers: () => ({
    inputValue: '', inputRef: { current: null }, isSending: false, isRecordingAudio: false,
    replyToMessage: null, editingMessage: null, forwardMessage: null,
    setInputValue: vi.fn(), handleReplyToMessage: vi.fn(), handleForwardMessage: vi.fn(),
    handleCopyMessage: vi.fn(), handleInteractiveButtonClick: vi.fn(), handleEditStart: vi.fn(),
    handleInputChange: vi.fn(), handleKeyDown: vi.fn(), handleCancelEdit: vi.fn(),
    handleSlashCommand: vi.fn(), handleAudioSend: vi.fn(), handleSend: vi.fn(),
    handleSendInteractiveMessage: vi.fn(), handleForwardToTargets: vi.fn(), handleSendLocation: vi.fn(),
  }),
}));
vi.mock('../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('../chat/ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('../chat/ChatInputArea', () => ({ ChatInputArea: () => null }));
vi.mock('../chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('../chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('../chat/ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('../chat/ChatDialogs', () => ({ ChatDialogs: () => null }));
vi.mock('../WhisperMode', () => ({ WhisperMode: () => null }));
vi.mock('../NextBestActionEngine', () => ({ NextBestActionEngine: () => null }));
vi.mock('../TransferDialog', () => ({ default: () => null }));
vi.mock('../AIConversationAssistant', () => ({ default: () => null }));
vi.mock('../CloseConversationDialog', () => ({ default: () => null }));

// ---- vizinhos da própria ChatMessagesArea (mantida REAL) ----
vi.mock('../chat/MessageBubble', () => ({ MessageBubble: () => null }));
vi.mock('../TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('@/services/realtime.service', () => ({
  RealtimeService: { subscribeToReactions: vi.fn(() => ({})), removeChannel: vi.fn() },
}));
vi.mock('@/services/chat.service', () => ({
  ChatService: { deleteMessage: vi.fn(async () => undefined), uploadAudio: vi.fn(), sendMessage: vi.fn() },
}));

import { RealtimeInboxView } from '../RealtimeInboxView';

// Pré-carrega o MESMO módulo que o `React.lazy` de RealtimeInboxView importa
// (RealtimeInboxView.tsx:28). Sem isto o import dinâmico transforma o ChatPanel
// DURANTE a renderização: sob a suíte completa essa transformação estoura o
// timeout padrão (1s) do `findByRole`, a árvore fica presa no <ChatFallback/> e
// o teste falha por timing, não por contrato. Pré-carregar tira a transformação
// da janela do findBy — sem aumentar timeout global e sem afrouxar assert: o
// caminho de componentes segue o de produção (RealtimeInboxView -> ChatPanel ->
// ChatMessagesArea), só o carregamento do módulo deixa de ser assíncrono.
import '../ChatPanel';

const CONTACT_ID = 'contato-1';

const conversation = {
  id: CONTACT_ID,
  contact: { id: CONTACT_ID, name: 'Maria Silva', phone: '+5511999999999', avatar: '' },
  lastMessage: { content: 'oi', timestamp: new Date('2026-10-05T12:00:00Z') },
} as unknown as Conversation;

function buildMessages(): Message[] {
  // Histórico já carregado (a página de 1000); a paginação serve para o que vem ANTES.
  return [
    { id: 'm-1', conversationId: CONTACT_ID, sender: 'contact', content: 'primeira', timestamp: new Date('2026-10-05T12:00:00Z'), type: 'text', status: 'sent' },
    { id: 'm-2', conversationId: CONTACT_ID, sender: 'agent', content: 'segunda', timestamp: new Date('2026-10-05T12:01:00Z'), type: 'text', status: 'sent' },
  ] as unknown as Message[];
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function buildUi() {
  // Elemento NOVO a cada render: reutilizar o mesmo elemento faz o React bailar
  // out (props identicas por referencia) e a Inbox nao veria o novo estado da fachada.
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RealtimeInboxView />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function renderInbox(): { rerender: () => void } {
  const { rerender } = render(buildUi());
  return { rerender: () => rerender(buildUi()) };
}

const CARREGAR = /carregar mensagens anteriores/i;

function baseInbox(): Record<string, unknown> {
  return {
    cachedConversations: [],
    conversations: [],
    loading: false,
    error: null,
    selectedContactId: CONTACT_ID,
    setSelectedContactId: vi.fn(),
    setSelectedContact: vi.fn(),
    markAsRead: vi.fn(),
    handleSelectConversation: vi.fn(),
    pendingContactId: null,
    setPendingContactId: vi.fn(),
    conversationTab: 'chat',
    setConversationTab: vi.fn(),
    globalSearchOpen: false,
    setGlobalSearchOpen: vi.fn(),
    newMessageNotification: null,
    dismissNotification: vi.fn(),
    handleNotificationView: vi.fn(),
    showNewConversation: false,
    setShowNewConversation: vi.fn(),
    showDetails: false,
    setShowDetails: vi.fn(),
    usingCache: false,
    pipContact: null,
    setPipContact: vi.fn(),
    refetch: vi.fn(),
    profile: { id: 'perfil-1' },
    selectedMessagesLoading: false,
    legacyConversation: conversation,
    legacyMessages: buildMessages(),
    handleSendMessage: vi.fn(),
    handleSendAudio: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inbox = { ...baseInbox(), hasOlderMessages: true, loadingOlderMessages: false, loadOlderMessages: mocks.loadOlderMessages };
});

describe('RealtimeInboxView — contrato de paginação da Inbox ativa (R2-INB-004)', () => {
  it('leva o clique visível ao inbox.loadOlderMessages exatamente uma vez e reflete o loading', async () => {
    const { rerender } = renderInbox();

    const botao = await screen.findByRole('button', { name: CARREGAR });

    fireEvent.click(botao);
    expect(mocks.loadOlderMessages).toHaveBeenCalledTimes(1);

    // O hook publica loading=true durante a promessa: o controle visível tem de refletir.
    mocks.inbox = { ...mocks.inbox, loadingOlderMessages: true };
    rerender();

    const emCarga = await screen.findByRole('button', { name: CARREGAR });
    expect(emCarga).toBeDisabled();
    expect(emCarga).toHaveAttribute('aria-busy', 'true');
    expect(mocks.loadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it('não oferece ação de carga quando hasOlderMessages é falso', async () => {
    mocks.inbox = { ...mocks.inbox, hasOlderMessages: false, loadOlderMessages: mocks.loadOlderMessages };
    renderInbox();

    // Prova que a Inbox ativa montou (o painel da conversa está na árvore) e só então
    // que o controle de carga NÃO existe.
    await screen.findByRole('log', { name: /mensagens da conversa/i });
    expect(screen.queryByRole('button', { name: CARREGAR })).toBeNull();
    expect(mocks.loadOlderMessages).not.toHaveBeenCalled();
  });
});
