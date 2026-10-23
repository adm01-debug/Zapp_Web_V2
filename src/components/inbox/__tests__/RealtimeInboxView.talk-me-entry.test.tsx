/**
 * Entrada do TALK ME no Inbox. A orquestração da RealtimeInboxView é real;
 * lista, chat e overlay são stubs pequenos para observar montagem e estado sem
 * trazer os hooks pesados desses filhos para o contrato desta integração.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

interface QueueState {
  queuesError: boolean;
  queuesLoading: boolean;
  selectedQueue: { name: string; waitingCount: number } | null;
}

const mocks = vi.hoisted(() => ({
  enabled: true,
  inbox: {} as Record<string, unknown>,
  queue: {
    queuesError: false,
    queuesLoading: false,
    selectedQueue: { name: 'Comercial', waitingCount: 142 },
  } as QueueState,
}));

vi.mock('@/hooks/inbox/useRealtimeInbox', () => ({ useRealtimeInbox: () => mocks.inbox }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => mocks.enabled }));
vi.mock('@/features/talk-me/useTalkMeQueue', () => ({ useTalkMeQueue: () => mocks.queue }));
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/ui/usePullToRefresh', () => ({ usePullToRefresh: () => ({}) }));
vi.mock('@/hooks/ui/useGlobalSearchShortcut', () => ({ useGlobalSearchShortcut: vi.fn() }));
vi.mock('@/hooks/inbox/useInboxBulkActions', () => ({
  useInboxBulkActions: () => ({
    selectAll: vi.fn(), selectionMode: false, selectedIds: new Set<string>(),
    bulkArchive: vi.fn(), bulkTransfer: vi.fn(), clearSelection: vi.fn(),
    bulkMarkAsRead: vi.fn(), bulkLoading: false,
  }),
}));
vi.mock('@/hooks/inbox/useInboxFilters', async () => {
  const { useState } = await import('react');
  return {
    useInboxFilters: () => {
      const [search, setSearch] = useState('');
      return {
        filteredConversations: [], search, setSearch,
        setMainTab: vi.fn(), setSubTab: vi.fn(), setChipTab: vi.fn(),
        chipCounts: { waiting: 0, unread: 0 },
      };
    },
  };
});
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    pinnedIds: new Set<string>(), snoozedIds: new Set<string>(),
    isFavorite: () => false, favoriteContact: vi.fn(), unfavoriteContact: vi.fn(),
    archiveContact: vi.fn(), reopenConversation: vi.fn(),
  }),
}));
vi.mock('@/hooks/chat/useConversationTabCounts', () => ({
  useConversationTabCounts: () => ({ counts: { tasksOpen: 0, notesTotal: 0, filesTotal: 0 } }),
}));
vi.mock('@/hooks/crm/useContactCrm360', () => ({ useContactCrm360: () => ({ data: null }) }));
vi.mock('@/hooks/gmail/useContactUnreadEmails', () => ({
  useContactUnreadEmails: () => ({ count: 0, status: 'ok' }),
}));

vi.mock('@/components/mobile/MiniChatPiP', () => ({ MiniChatPiP: () => null }));
vi.mock('../NewMessageIndicator', () => ({ NewMessageIndicator: () => null }));
vi.mock('../InboxEmptyChat', () => ({ InboxEmptyChat: () => <div data-testid="empty-chat" /> }));
vi.mock('../ConversationListSidebar', () => ({
  ConversationListSidebar: ({ inbox, inboxFilters }: {
    inbox: { selectedContactId?: string | null };
    inboxFilters: { search: string; setSearch: (value: string) => void };
  }) => (
    <aside data-testid="list-background">
      <span data-testid="list-selected-contact">{inbox.selectedContactId ?? 'nenhum'}</span>
      <input
        aria-label="Filtro persistente"
        value={inboxFilters.search}
        onChange={(event) => inboxFilters.setSearch(event.currentTarget.value)}
      />
    </aside>
  ),
}));
vi.mock('../chat/ConversationTabContent', () => ({
  ConversationTabContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../ChatPanel', () => ({
  ChatPanel: ({ conversation }: { conversation: { contact: { id: string } } }) => (
    <main data-testid="chat-background">Contato {conversation.contact.id}</main>
  ),
}));
vi.mock('@/features/talk-me/TalkMeView', () => ({
  TalkMeView: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
    open ? (
      <div role="dialog" aria-label="TALK ME">
        <button type="button" onClick={() => onOpenChange(false)}>Fechar TALK ME</button>
      </div>
    ) : null,
}));
vi.mock('../ContactDetails', () => ({ default: () => null }));
vi.mock('../ContactDetailsResponsive', () => ({ default: () => null }));
vi.mock('../GlobalSearch', () => ({ default: () => null }));
vi.mock('../NewConversationModal', () => ({ default: () => null }));

import { RealtimeInboxView } from '../RealtimeInboxView';

const CONTACT_ID = 'contato-42';

function baseInbox(selected = true): Record<string, unknown> {
  const contact = { id: CONTACT_ID, name: 'Ana', email: 'ana@example.com', avatar: null };
  return {
    cachedConversations: [], conversations: [], loading: false, error: null,
    usingCache: false, selectedMessagesFromCache: false,
    selectedContactId: selected ? CONTACT_ID : null,
    setSelectedContactId: vi.fn(), setSelectedContact: vi.fn(), markAsRead: vi.fn(),
    handleSelectConversation: vi.fn(), pendingContactId: null, setPendingContactId: vi.fn(),
    conversationTab: 'chat', setConversationTab: vi.fn(),
    globalSearchOpen: false, setGlobalSearchOpen: vi.fn(),
    newMessageNotification: null, dismissNotification: vi.fn(), handleNotificationView: vi.fn(),
    showNewConversation: false, setShowNewConversation: vi.fn(),
    showDetails: false, setShowDetails: vi.fn(), pipContact: null, setPipContact: vi.fn(),
    refetch: vi.fn(), profile: { id: 'perfil-1' },
    selectedMessagesLoading: false, selectedMessagesError: null,
    legacyConversation: selected
      ? { id: CONTACT_ID, contact, lastMessage: { content: 'oi' } }
      : null,
    legacyMessages: [], handleSendMessage: vi.fn(), handleSendAudio: vi.fn(),
    hasOlderMessages: false, loadingOlderMessages: false, loadOlderMessages: vi.fn(),
  };
}

function renderInbox() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RealtimeInboxView />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.inbox = baseInbox(true);
  mocks.queue = {
    queuesError: false,
    queuesLoading: false,
    selectedQueue: { name: 'Comercial', waitingCount: 142 },
  };
});

describe('RealtimeInboxView — entrada do TALK ME', () => {
  it('flag desligada remove gatilhos e o acesso ao overlay', () => {
    mocks.enabled = false;
    renderInbox();

    expect(document.querySelectorAll('[data-talkme-trigger]')).toHaveLength(0);
    expect(screen.queryByRole('dialog', { name: 'TALK ME' })).not.toBeInTheDocument();
  });

  it('desktop sem contato selecionado monta exatamente um gatilho', () => {
    mocks.inbox = baseInbox(false);
    renderInbox();

    const triggers = document.querySelectorAll('[data-talkme-trigger="1"]');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toHaveAttribute('data-testid', 'talk-me-button-empty');
  });

  it('expõe contagem exata e departamento no nome acessível e no title', () => {
    renderInbox();

    const trigger = screen.getByTestId('talk-me-button');
    expect(trigger).toHaveAttribute(
      'aria-label',
      'TALK ME: 142 atendimentos aguardando em Comercial',
    );
    expect(trigger).toHaveAttribute(
      'title',
      'Abrir TALK ME — 142 atendimentos aguardando em Comercial',
    );
    expect(trigger).toHaveTextContent('99+');
  });

  it('erro de fila omite o número e anuncia que a contagem está indisponível', () => {
    mocks.queue = {
      queuesError: true,
      queuesLoading: false,
      selectedQueue: { name: 'Suporte', waitingCount: 0 },
    };
    renderInbox();

    const trigger = screen.getByTestId('talk-me-button');
    expect(trigger).toHaveAttribute(
      'aria-label',
      'TALK ME: contagem de atendimentos indisponível em Suporte',
    );
    expect(trigger).toHaveAttribute(
      'title',
      'Abrir TALK ME — contagem de atendimentos indisponível em Suporte',
    );
    expect(trigger).not.toHaveTextContent('0');
  });

  it('devolve o foco ao gatilho que abriu depois de fechar', async () => {
    renderInbox();
    const trigger = screen.getByTestId('talk-me-button');

    fireEvent.click(trigger);
    const close = screen.getByRole('button', { name: 'Fechar TALK ME' });
    close.focus();
    fireEvent.click(close);

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('mantém lista, chat, filtro e contato selecionado montados ao abrir e fechar', async () => {
    renderInbox();
    const listBefore = screen.getByTestId('list-background');
    const chatBefore = await screen.findByTestId('chat-background');
    const filter = screen.getByRole('textbox', { name: 'Filtro persistente' });
    fireEvent.change(filter, { target: { value: 'prioridade' } });

    fireEvent.click(screen.getByTestId('talk-me-button'));
    expect(screen.getByRole('dialog', { name: 'TALK ME' })).toBeInTheDocument();
    expect(screen.getByTestId('list-background')).toBe(listBefore);
    expect(screen.getByTestId('chat-background')).toBe(chatBefore);
    expect(filter).toHaveValue('prioridade');
    expect(screen.getByTestId('list-selected-contact')).toHaveTextContent(CONTACT_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar TALK ME' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'TALK ME' })).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('list-background')).toBe(listBefore);
    expect(screen.getByTestId('chat-background')).toBe(chatBefore);
    expect(filter).toHaveValue('prioridade');
    expect(screen.getByTestId('list-selected-contact')).toHaveTextContent(CONTACT_ID);
  });
});
