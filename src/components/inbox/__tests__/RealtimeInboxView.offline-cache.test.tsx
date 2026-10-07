/**
 * R2-INB-015 (#311) — a tela de erro global substituía a Inbox mesmo com cache
 * offline válido ("erro de conexão" engolia as conversas guardadas). O contrato
 * aqui: erro SEM cache mantém a tela de erro; erro COM cache mantém a Inbox
 * utilizável e anuncia o modo offline — e o recorte de mensagens em cache da
 * conversa ativa é identificado na faixa.
 *
 * Só o hook de dados é substituído; o caminho de componentes é o de produção.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));
vi.mock('@/features/talk-me/useTalkMeQueue', () => ({
  useTalkMeQueue: () => ({ queuesError: false, selectedQueue: null, queuesLoading: false }),
}));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }) }, from: () => ({ update: () => ({ eq: () => ({ error: null }) }) }) },
}));

// ---- componentes irmãos pesados / lazy (a Inbox em si fica real) ----
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
    usingCache: false,
    selectedMessagesFromCache: false,
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
    setShowNewConversation: vi.fn(),
    showDetails: false,
    setShowDetails: vi.fn(),
    pipContact: null,
    setPipContact: vi.fn(),
    refetch: vi.fn(),
    profile: { id: 'perfil-1' },
    selectedMessagesLoading: false,
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

const BANNER = /Modo offline/i;
const ERRO = 'Erro de conexão';

describe('RealtimeInboxView — cache offline sobrevive ao erro de conexão (R2-INB-015)', () => {
  it('com cache válido, o erro não substitui a Inbox e a faixa de offline aparece', () => {
    mocks.inbox = {
      ...baseInbox(),
      error: 'Falha ao carregar conversas',
      usingCache: true,
      selectedMessagesFromCache: true,
    };

    render(buildUi());

    expect(screen.getByText(BANNER)).toBeTruthy();
    expect(screen.getByTestId('inbox-offline-cache-messages')).toBeTruthy();
    expect(screen.queryByText(ERRO)).toBeNull();
  });

  it('sem cache, o erro de conexão continua ocupando a tela', () => {
    mocks.inbox = { ...baseInbox(), error: 'Falha ao carregar conversas', usingCache: false };

    render(buildUi());

    expect(screen.getByText(ERRO)).toBeTruthy();
    expect(screen.queryByText(BANNER)).toBeNull();
  });

  it('com cache e sem recorte de mensagens o rótulo do recorte não aparece', () => {
    mocks.inbox = { ...baseInbox(), usingCache: true, selectedMessagesFromCache: false };

    render(buildUi());

    expect(screen.getByText(BANNER)).toBeTruthy();
    expect(screen.queryByTestId('inbox-offline-cache-messages')).toBeNull();
  });
});
