/**
 * U03 — integração do chip "E-mail" na barra de abas do chat.
 *
 * A barra REAL (`ConversationTabs` + `EmailUnreadChip`) é renderizada com o
 * `RealtimeInboxView` REAL; só o hook de contagem (U02) e o `navigateToView` são
 * substituídos. Prova o caminho de produção:
 *  - não lidos do contato → chip com a contagem certa;
 *  - clique → `navigateToView('email-chat', { emailContact, emailTo })` (link do C03);
 *  - 0 não lidos OU erro do hook (count 0) → nenhum chip.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  inbox: {} as Record<string, unknown>,
  unread: { count: 0, status: 'idle' } as { count: number; status: string },
  navigateToView: vi.fn(),
}));

vi.mock('@/hooks/inbox/useRealtimeInbox', () => ({ useRealtimeInbox: () => mocks.inbox }));
vi.mock('@/hooks/gmail/useContactUnreadEmails', () => ({
  useContactUnreadEmails: () => mocks.unread,
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  navigateToView: mocks.navigateToView,
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
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }) }, from: () => ({ update: () => ({ eq: () => ({ error: null }) }) }) },
}));

// ---- irmãos pesados / lazy (a barra de abas fica REAL) ----
vi.mock('@/components/mobile/MiniChatPiP', () => ({ MiniChatPiP: () => null }));
vi.mock('../NewMessageIndicator', () => ({ NewMessageIndicator: () => null }));
vi.mock('../InboxEmptyChat', () => ({ InboxEmptyChat: () => null }));
vi.mock('../ConversationListSidebar', () => ({ ConversationListSidebar: () => null }));
vi.mock('../chat/ConversationTabContent', () => ({ ConversationTabContent: () => null }));
vi.mock('@/features/talk-me/TalkMeView', () => ({ TalkMeView: () => null }));
vi.mock('../ContactDetails', () => ({ default: () => null }));
vi.mock('../ContactDetailsResponsive', () => ({ default: () => null }));
vi.mock('../GlobalSearch', () => ({ default: () => null }));
vi.mock('../NewConversationModal', () => ({ default: () => null }));

import { RealtimeInboxView } from '../RealtimeInboxView';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const CONTATO = { id: '11111111-1111-1111-1111-111111111111', name: 'Ana', email: 'ana@teste.com', avatar: null };

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
    cachedConversations: [], conversations: [], loading: false, error: null,
    usingCache: false, selectedMessagesFromCache: false,
    selectedContactId: CONTATO.id, setSelectedContactId: vi.fn(),
    setSelectedContact: vi.fn(), markAsRead: vi.fn(), handleSelectConversation: vi.fn(),
    pendingContactId: null, setPendingContactId: vi.fn(),
    conversationTab: 'chat', setConversationTab: vi.fn(),
    globalSearchOpen: false, setGlobalSearchOpen: vi.fn(),
    newMessageNotification: null, dismissNotification: vi.fn(), handleNotificationView: vi.fn(),
    showNewConversation: false, setShowNewConversation: vi.fn(),
    showDetails: false, setShowDetails: vi.fn(),
    pipContact: null, setPipContact: vi.fn(), refetch: vi.fn(),
    profile: { id: 'perfil-1' },
    selectedMessagesLoading: false, selectedMessagesError: null,
    legacyConversation: { id: CONTATO.id, contact: CONTATO, lastMessage: { content: 'oi' } },
    legacyMessages: [],
    handleSendMessage: vi.fn(), handleSendAudio: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inbox = baseInbox();
  mocks.unread = { count: 0, status: 'idle' };
});

describe('RealtimeInboxView — chip de e-mails não lidos (U03)', () => {
  it('mostra o chip com a contagem dos e-mails não lidos do contato', () => {
    mocks.unread = { count: 4, status: 'ok' };
    render(buildUi());
    expect(screen.getByTestId('email-unread-chip')).toBeInTheDocument();
    expect(screen.getByTestId('email-unread-chip-count')).toHaveTextContent('4');
  });

  it('clicar no chip abre o e-mail do contato (navigateToView email-chat do C03)', () => {
    mocks.unread = { count: 1, status: 'ok' };
    render(buildUi());
    fireEvent.click(screen.getByTestId('email-unread-chip'));
    expect(mocks.navigateToView).toHaveBeenCalledWith('email-chat', {
      emailContact: CONTATO.id,
      emailTo: CONTATO.email,
    });
  });

  it('sem e-mails não lidos o chip não aparece', () => {
    mocks.unread = { count: 0, status: 'ok' };
    render(buildUi());
    expect(screen.queryByTestId('email-unread-chip')).not.toBeInTheDocument();
  });

  it('erro do hook de contagem (count 0) não mostra chip', () => {
    mocks.unread = { count: 0, status: 'erro' };
    render(buildUi());
    expect(screen.queryByTestId('email-unread-chip')).not.toBeInTheDocument();
  });
});
