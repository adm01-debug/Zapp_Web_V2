/**
 * L6 (paridade V3→V2, doc 11) — a Inbox anuncia mensagem nova em região
 * `aria-live`, e só quando o total de não lidas SOBE.
 *
 * A tela real (`RealtimeInboxView`) é montada com o hook de dados trocado por
 * uma fachada controlada; a região viva é a mesma que o usuário cego ouve.
 * A carga inicial entra com não lidas e NÃO pode anunciar nada: abrir a Inbox
 * não é mensagem nova. Um aumento anuncia "Nova mensagem recebida" (1) ou
 * "N novas mensagens" (N), e uma queda (marcar como lida) não anuncia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Conversation } from '@/types/chat';

const mocks = vi.hoisted(() => ({
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
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { RealtimeInboxView } from '../RealtimeInboxView';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function conversa(id: string, unreadCount: number): Conversation {
  return {
    id,
    contact: { id, name: `Contato ${id}`, phone: '+551****9999', avatar: '' },
    lastMessage: { content: 'oi', timestamp: new Date('2026-10-05T12:00:00Z') },
    unreadCount,
  } as unknown as Conversation;
}

function ui() {
  // Elemento NOVO a cada render: a fachada é lida no render do componente.
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RealtimeInboxView />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function baseInbox(cachedConversations: Conversation[]): Record<string, unknown> {
  return {
    cachedConversations,
    conversations: cachedConversations,
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
    setShowNewConversation: vi.fn(),
    showDetails: false,
    setShowDetails: vi.fn(),
    usingCache: false,
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

const regiao = () => screen.getByTestId('inbox-novas-mensagens');

function montarCom(conversas: Conversation[]) {
  mocks.inbox = baseInbox(conversas);
  return render(ui());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RealtimeInboxView — anúncio aria de mensagem nova (L6)', () => {
  it('a região aria-live existe, é silenciosa e não anuncia na carga inicial', () => {
    montarCom([conversa('c-1', 4)]);

    expect(regiao()).toHaveAttribute('role', 'status');
    expect(regiao()).toHaveAttribute('aria-live', 'polite');
    expect(regiao().textContent).toBe('');
  });

  it('anuncia "Nova mensagem recebida" quando o total sobe de 0 para 1', () => {
    const { rerender } = montarCom([conversa('c-1', 0)]);
    expect(regiao().textContent).toBe('');

    mocks.inbox = baseInbox([conversa('c-1', 1)]);
    rerender(ui());

    expect(regiao().textContent).toBe('Nova mensagem recebida');
  });

  it('anuncia o número de novas mensagens quando o total sobe mais de uma', () => {
    const { rerender } = montarCom([conversa('c-1', 1), conversa('c-2', 0)]);
    expect(regiao().textContent).toBe('');

    mocks.inbox = baseInbox([conversa('c-1', 3), conversa('c-2', 2)]);
    rerender(ui());

    expect(regiao().textContent).toBe('4 novas mensagens');
  });

  it('não anuncia quando o total cai (marcar como lida)', () => {
    const { rerender } = montarCom([conversa('c-1', 2), conversa('c-2', 3)]);
    expect(regiao().textContent).toBe('');

    mocks.inbox = baseInbox([conversa('c-1', 0), conversa('c-2', 1)]);
    rerender(ui());

    expect(regiao().textContent).toBe('');
  });
});
