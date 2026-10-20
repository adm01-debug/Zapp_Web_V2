/**
 * t_16e19364 — o botão do estado vazio abre o NewConversationModal.
 *
 * Aqui a `InboxEmptyChat` é montada de VERDADE (não há mock dela): o clique no
 * botão tem de chegar ao `setShowNewConversation(true)` da `RealtimeInboxView`,
 * que é quem monta o modal. Também prova que os contadores exibidos são os
 * mesmos números que a lista usa (`chipCounts`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Conversation } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  setShowNewConversation: vi.fn(),
  refetch: vi.fn(),
  chipCounts: { waiting: 4, unread: 2 } as Record<string, number>,
  inbox: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/inbox/useRealtimeInbox', () => ({
  useRealtimeInbox: () => mocks.inbox,
}));

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
  useInboxFilters: () => ({
    filteredConversations: [], setMainTab: vi.fn(), setSubTab: vi.fn(),
    chipCounts: mocks.chipCounts,
  }),
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

// Stubs dos irmãos; a InboxEmptyChat NÃO é mockada de propósito.
vi.mock('@/components/mobile/MiniChatPiP', () => ({ MiniChatPiP: () => null }));
vi.mock('../NewMessageIndicator', () => ({ NewMessageIndicator: () => null }));
vi.mock('../ConversationListSidebar', () => ({ ConversationListSidebar: () => null }));
vi.mock('../chat/ConversationTabs', () => ({ ConversationTabs: () => null }));
vi.mock('../chat/ConversationTabContent', () => ({ ConversationTabContent: () => null }));
vi.mock('../ChatPanel', () => ({ ChatPanel: () => null }));
vi.mock('@/features/talk-me/TalkMeView', () => ({ TalkMeView: () => null }));
vi.mock('../ContactDetails', () => ({ default: () => null }));
vi.mock('../ContactDetailsResponsive', () => ({ default: () => null }));
vi.mock('../GlobalSearch', () => ({ default: () => null }));

import { RealtimeInboxView } from '../RealtimeInboxView';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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
    legacyConversation: null as unknown as Conversation,
    legacyMessages: [],
    handleSendMessage: vi.fn(),
    handleSendAudio: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inbox = baseInbox();
  mocks.chipCounts = { waiting: 4, unread: 2 };
});

describe('t_16e19364 — estado vazio do Inbox', () => {
  it('sem conversa selecionada: o botão "Nova conversa" abre o modal (setShowNewConversation(true))', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RealtimeInboxView />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    // O FAB da tela também se chama "Nova conversa"; o alvo é o botão do
    // estado vazio, o único dentro de `inbox-empty-actions`.
    const vazio = within(screen.getByTestId('inbox-empty-actions'));
    const botao = vazio.getByRole('button', { name: 'Nova conversa' });
    expect(mocks.setShowNewConversation).not.toHaveBeenCalled();

    fireEvent.click(botao);

    expect(mocks.setShowNewConversation).toHaveBeenCalledTimes(1);
    expect(mocks.setShowNewConversation).toHaveBeenCalledWith(true);
  });

  it('os contadores do estado vazio são os mesmos números da lista (chipCounts)', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RealtimeInboxView />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('inbox-empty-waiting')).toHaveTextContent('4 aguardando');
    expect(screen.getByTestId('inbox-empty-unread')).toHaveTextContent('2 não lidas');
  });
});
