/**
 * Contato fora da lista (notificação, busca, link) que não pôde ser aberto — a área de
 * chat antes caía no estado vazio genérico ("Selecione uma conversa"), indistinguível de
 * "nenhuma conversa escolhida". O contrato aqui: com a consulta em 'not-found' ou 'error'
 * a Inbox mostra o motivo em pt-BR e a ação "Voltar à lista" limpa a seleção.
 *
 * Só o hook de dados é substituído; o caminho de componentes é o de produção.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
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
vi.mock('@/hooks/gmail/useContactUnreadEmails', () => ({ useContactUnreadEmails: () => ({ count: 0 }) }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));
vi.mock('@/features/talk-me/useTalkMeQueue', () => ({
  useTalkMeQueue: () => ({ queuesError: false, selectedQueue: null, queuesLoading: false }),
}));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }) }, from: () => ({ update: () => ({ eq: () => ({ error: null }) }) }) },
}));

// ---- componentes irmãos pesados / lazy (a Inbox em si fica real) ----
vi.mock('@/components/mobile/MiniChatPiP', () => ({ MiniChatPiP: () => null }));
vi.mock('../NewMessageIndicator', () => ({ NewMessageIndicator: () => null }));
vi.mock('../InboxEmptyChat', () => ({ InboxEmptyChat: () => <div data-testid="empty-chat-generico" /> }));
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

const CONTATO = '11111111-1111-1111-1111-111111111111';

function baseInbox(): Record<string, unknown> {
  return {
    cachedConversations: [],
    conversations: [],
    loading: false,
    error: null,
    usingCache: false,
    selectedMessagesFromCache: false,
    selectedContactId: CONTATO,
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
    pipContact: null,
    setPipContact: vi.fn(),
    refetch: vi.fn(),
    profile: { id: 'perfil-1' },
    selectedMessagesLoading: false,
    selectedMessagesError: null,
    selectedContactFallbackStatus: 'idle',
    selectedContactFallbackError: null,
    legacyConversation: null,
    legacyMessages: [],
    handleSendMessage: vi.fn(),
    handleSendAudio: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inbox = baseInbox();
});

describe('RealtimeInboxView — contato fora da lista não abre em silêncio', () => {
  it('"não encontrado" mostra o motivo e "Voltar à lista" limpa a seleção', () => {
    mocks.inbox = { ...baseInbox(), selectedContactFallbackStatus: 'not-found' };

    render(buildUi());

    expect(screen.getByText('Conversa não encontrada')).toBeTruthy();
    expect(screen.queryByTestId('empty-chat-generico')).toBeNull();

    fireEvent.click(screen.getByText('Voltar à lista'));
    expect((mocks.inbox.setSelectedContactId as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(null);
  });

  it('falha de carga mostra o motivo do erro em vez do estado vazio genérico', () => {
    mocks.inbox = {
      ...baseInbox(),
      selectedContactFallbackStatus: 'error',
      selectedContactFallbackError: 'Não foi possível carregar o contato.',
    };

    render(buildUi());

    expect(screen.getByText('Não foi possível abrir a conversa')).toBeTruthy();
    expect(screen.getByText('Não foi possível carregar o contato.')).toBeTruthy();
    expect(screen.queryByTestId('empty-chat-generico')).toBeNull();
  });

  it('sem contato selecionado o estado vazio genérico continua', () => {
    mocks.inbox = { ...baseInbox(), selectedContactId: null, selectedContactFallbackStatus: 'idle' };

    render(buildUi());

    expect(screen.getByTestId('empty-chat-generico')).toBeTruthy();
    expect(screen.queryByText('Conversa não encontrada')).toBeNull();
  });
});
