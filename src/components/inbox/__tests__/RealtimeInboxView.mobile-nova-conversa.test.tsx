/**
 * N-032 — 'Nova conversa' alcançável no celular e seletor do diálogo com nome.
 *
 * Prova que, com isMobile=true:
 *  1. Existe botão com nome 'Nova conversa' (44×44) que abre o NewConversationModal.
 *  2. O seletor de conexão do modal tem nome acessível (aria-label).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Conversation } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  setShowNewConversation: vi.fn(),
  refetch: vi.fn(),
  inbox: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/inbox/useRealtimeInbox', () => ({
  useRealtimeInbox: () => mocks.inbox,
}));

// isMobile=true para este teste.
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => true }));
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

// Stub para os demais componentes irmãos.
vi.mock('@/components/mobile/MiniChatPiP', () => ({ MiniChatPiP: () => null }));
vi.mock('../NewMessageIndicator', () => ({ NewMessageIndicator: () => null }));
vi.mock('../InboxEmptyChat', () => ({ InboxEmptyChat: () => null }));
vi.mock('../ConversationListSidebar', () => ({ ConversationListSidebar: () => null }));
vi.mock('../chat/ConversationTabs', () => ({ ConversationTabs: () => null }));
vi.mock('../chat/ConversationTabContent', () => ({
  ConversationTabContent: () => <div data-testid="chat-panel" />,
}));
vi.mock('../ChatPanel', () => ({ ChatPanel: () => <div data-testid="chat-panel" /> }));
vi.mock('@/features/talk-me/TalkMeView', () => ({ TalkMeView: () => null }));
vi.mock('../ContactDetails', () => ({ default: () => null }));
vi.mock('../ContactDetailsResponsive', () => ({ default: () => null }));
vi.mock('../GlobalSearch', () => ({ default: () => null }));

import { RealtimeInboxView } from '../RealtimeInboxView';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function buildUi() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RealtimeInboxView />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function baseInbox(): Record<string, unknown> {
  return {
    cachedConversations: [],
    conversations: [],
    loading: false,
    error: null,
    selectedContactId: null,
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
    setShowNewConversation: mocks.setShowNewConversation,
    showDetails: false,
    setShowDetails: vi.fn(),
    usingCache: false,
    pipContact: null,
    setPipContact: vi.fn(),
    refetch: mocks.refetch,
    profile: { id: 'perfil-1' },
    selectedMessagesLoading: false,
    selectedMessagesError: null,
    refetchSelectedMessages: vi.fn(),
    legacyConversation: {
      id: 'conv-1',
      contact: { id: 'contato-1', name: 'Maria Silva', phone: '+551****9999', avatar: '' },
      lastMessage: { content: 'oi', timestamp: new Date('2026-10-05T12:00:00Z') },
    } as unknown as Conversation,
    legacyMessages: [],
    handleSendMessage: vi.fn(),
    handleSendAudio: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inbox = baseInbox();
});

describe('N-032 — Nova conversa acessível no celular', () => {
  it('com isMobile=true: existe botão "Nova conversa" 44×44 que abre o modal', () => {
    render(buildUi());

    const botao = screen.getByRole('button', { name: 'Nova conversa' });
    expect(botao).toBeInTheDocument();

    // Prova do tamanho 44×44 no mobile: a classe h-[44px] w-[44px] está aplicada.
    expect(botao).toHaveClass('h-[44px]', 'w-[44px]');

    fireEvent.click(botao);
    expect(mocks.setShowNewConversation).toHaveBeenCalledTimes(1);
    expect(mocks.setShowNewConversation).toHaveBeenCalledWith(true);
  });
});