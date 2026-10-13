/**
 * DL1 — busca global da Inbox abre a conversa E a mensagem.
 *
 * O `handleGlobalSearchResult` da Inbox só trocava de conversa. Agora um
 * resultado de mensagem/transcrição também publica o id dela
 * (`setInitialHighlightMessageId`) para o ChatPanel realçar e rolar até a
 * mensagem; resultado de contato/CRM não tem alvo e abre só a conversa.
 *
 * A árvore é a de produção (`RealtimeInboxView` -> `ChatPanel`), com o hook de
 * dados e a `GlobalSearch` trocados por fachadas controladas — é a fachada que
 * dispara o `onSelectResult`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Conversation, Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  inbox: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/inbox/useRealtimeInbox', () => ({
  useRealtimeInbox: () => mocks.inbox,
}));

vi.mock('../GlobalSearch', () => {
  const FakeGlobalSearch = ({
    onSelectResult,
  }: {
    onSelectResult: (result: unknown) => void;
  }) => (
    <div>
      <button onClick={() => onSelectResult({ contactId: 'c-9', type: 'message', id: 'msg-1' })}>
        selecionar mensagem
      </button>
      <button onClick={() => onSelectResult({ contactId: 'c-9', type: 'contact', id: 'c-9' })}>
        selecionar contato
      </button>
    </div>
  );
  return { GlobalSearch: FakeGlobalSearch, default: FakeGlobalSearch };
});

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
vi.mock('@/hooks/gmail/useContactUnreadEmails', () => ({ useContactUnreadEmails: () => ({ count: 0, status: 'ok' }) }));
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
import '../ChatPanel';

const ESPERA_LAZY = { timeout: 10000, interval: 50 };
const CONTACT_ID = 'contato-1';

const conversation = {
  id: CONTACT_ID,
  contact: { id: CONTACT_ID, name: 'Maria Silva', phone: '+551****9999', avatar: '' },
  lastMessage: { content: 'oi', timestamp: new Date('2026-10-05T12:00:00Z') },
} as unknown as Conversation;

function buildMessages(): Message[] {
  return [
    { id: 'm-1', conversationId: CONTACT_ID, sender: 'contact', content: 'primeira', timestamp: new Date('2026-10-05T12:00:00Z'), type: 'text', status: 'sent' },
  ] as unknown as Message[];
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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
    globalSearchOpen: true,
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
    hasOlderMessages: false,
    loadingOlderMessages: false,
    loadOlderMessages: vi.fn(),
    initialHighlightMessageId: null,
    setInitialHighlightMessageId: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inbox = baseInbox();
});

function renderInbox() {
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RealtimeInboxView />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('RealtimeInboxView — busca global leva à mensagem (DL1)', () => {
  it('resultado de mensagem abre a conversa e publica o id para o realce', async () => {
    renderInbox();

    const alvo = await screen.findByRole('button', { name: /selecionar mensagem/i }, ESPERA_LAZY);
    fireEvent.click(alvo);

    const inbox = mocks.inbox as { handleSelectConversation: ReturnType<typeof vi.fn>; setInitialHighlightMessageId: ReturnType<typeof vi.fn> };
    expect(inbox.handleSelectConversation).toHaveBeenCalledWith('c-9');
    expect(inbox.setInitialHighlightMessageId).toHaveBeenCalledWith('msg-1');
  });

  it('resultado de contato abre a conversa sem alvo de realce', async () => {
    renderInbox();

    const alvo = await screen.findByRole('button', { name: /selecionar contato/i }, ESPERA_LAZY);
    fireEvent.click(alvo);

    const inbox = mocks.inbox as { handleSelectConversation: ReturnType<typeof vi.fn>; setInitialHighlightMessageId: ReturnType<typeof vi.fn> };
    expect(inbox.handleSelectConversation).toHaveBeenCalledWith('c-9');
    expect(inbox.setInitialHighlightMessageId).not.toHaveBeenCalled();
  });
});
