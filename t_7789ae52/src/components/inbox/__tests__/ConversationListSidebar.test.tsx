/**
 * Cobre o achado da auditoria de 5 agentes: o diálogo de Resolver/Transferir
 * fechava sozinho quando a conversa some da lista em tempo real. A correção
 * trocou um useEffect com setState síncrono (bloqueado depois pelo lint
 * react-hooks/set-state-in-effect) por uma derivação no render
 * (activeResolveTarget/activeTransferTarget em ConversationListSidebar.tsx) —
 * este teste garante que o comportamento final continua correto.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/mobile/MobilePullToRefresh', () => ({
  MobilePullToRefreshIndicator: () => null,
}));
vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/inbox/BulkActionsToolbar', () => ({ BulkActionsToolbar: () => null }));
vi.mock('@/components/inbox/InboxFilters', () => ({ InboxFilters: () => null }));
vi.mock('@/components/inbox/conversation-list/StatusChips', () => ({ StatusChips: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

vi.mock('@/components/inbox/VirtualizedRealtimeList', () => ({
  VirtualizedRealtimeList: (props: {
    conversations?: Array<{ contact: { id: string } }>;
    pinnedIds?: Set<string>;
    favoriteIds?: Set<string>;
    onResolve?: (id: string) => void;
    onTransfer?: (id: string) => void;
    onArchive?: (id: string) => void;
  }) => (
    <div
      data-testid="vrl-stub"
      data-conversations-count={props.conversations?.length ?? 0}
      data-pinned-count={props.pinnedIds?.size ?? 0}
      data-favorite-count={props.favoriteIds?.size ?? 0}
    >
      <button onClick={() => props.onResolve?.('c1')}>abrir-resolver-c1</button>
      <button onClick={() => props.onTransfer?.('c1')}>abrir-transferir-c1</button>
      <button onClick={() => props.onArchive?.('c1')}>arquivar-c1</button>
    </div>
  ),
}));

vi.mock('@/components/inbox/CloseConversationDialog', () => ({
  CloseConversationDialog: (props: { open: boolean; contactId: string }) =>
    props.open ? <div data-testid="close-dialog">{props.contactId}</div> : null,
}));

vi.mock('@/components/inbox/TransferDialog', () => ({
  TransferDialog: (props: { open: boolean }) =>
    props.open ? <div data-testid="transfer-dialog" /> : null,
}));

import { ConversationListSidebar } from '@/components/inbox/ConversationListSidebar';

function baseProps(filteredConversations: Array<{ contact: { id: string } }>) {
  return {
    inbox: {
      selectedContactId: null,
      isOnline: true,
      cachedConversations: [],
      loading: false,
      refetch: vi.fn(),
      handleSelectConversation: vi.fn(),
    },
    inboxFilters: {
      filteredConversations,
      search: '',
      setSearch: vi.fn(),
      filters: {},
      setFilters: vi.fn(),
      showAll: false,
      setShowAll: vi.fn(),
      selectedContactType: 'all',
      handleContactTypeChange: vi.fn(),
      selectedQueueId: null,
      setSelectedQueueId: vi.fn(),
      chipTab: 'all',
      setChipTab: vi.fn(),
    },
    bulkActions: {
      selectedIds: new Set<string>(),
      bulkMarkAsRead: vi.fn(),
      bulkTransfer: vi.fn(),
      bulkArchive: vi.fn(),
      clearSelection: vi.fn(),
      bulkLoading: false,
      selectionMode: false,
      toggleSelection: vi.fn(),
    },
    pullToRefresh: {
      isRefreshing: false,
      pullProgress: 0,
      pullDistance: 0,
      containerRef: { current: null },
      handlers: {},
    },
    conversationActions: undefined,
  };
}

describe('ConversationListSidebar — diálogo de Resolver/Transferir some com a conversa', () => {
  it('abre o diálogo de Resolver para o contato clicado', () => {
    const props = baseProps([{ contact: { id: 'c1' } }]);
    render(<ConversationListSidebar {...props} />);

    fireEvent.click(screen.getByText('abrir-resolver-c1'));

    expect(screen.getByTestId('close-dialog')).toHaveTextContent('c1');
  });

  it('fecha o diálogo de Resolver quando o contato some da lista filtrada, sem precisar de uma ação explícita de fechar', () => {
    const props = baseProps([{ contact: { id: 'c1' } }]);
    const { rerender } = render(<ConversationListSidebar {...props} />);

    fireEvent.click(screen.getByText('abrir-resolver-c1'));
    expect(screen.getByTestId('close-dialog')).toBeInTheDocument();

    // Conversa some da lista filtrada em tempo real (ex.: outro agente já
    // resolveu) — sem clicar em nada, o diálogo não deve continuar aberto
    // apontando para um contactId que não existe mais na visão atual.
    rerender(<ConversationListSidebar {...baseProps([])} />);

    expect(screen.queryByTestId('close-dialog')).not.toBeInTheDocument();
  });

  it('mesmo comportamento para o diálogo de Transferir', () => {
    const props = baseProps([{ contact: { id: 'c1' } }]);
    const { rerender } = render(<ConversationListSidebar {...props} />);

    fireEvent.click(screen.getByText('abrir-transferir-c1'));
    expect(screen.getByTestId('transfer-dialog')).toBeInTheDocument();

    rerender(<ConversationListSidebar {...baseProps([{ contact: { id: 'outro-contato' } }])} />);

    expect(screen.queryByTestId('transfer-dialog')).not.toBeInTheDocument();
  });

  it('conversa continua na lista filtrada: diálogo permanece aberto entre re-renders', () => {
    const props = baseProps([{ contact: { id: 'c1' } }]);
    const { rerender } = render(<ConversationListSidebar {...props} />);

    fireEvent.click(screen.getByText('abrir-resolver-c1'));
    expect(screen.getByTestId('close-dialog')).toBeInTheDocument();

    rerender(<ConversationListSidebar {...baseProps([{ contact: { id: 'c1' } }, { contact: { id: 'c2' } }])} />);

    expect(screen.getByTestId('close-dialog')).toBeInTheDocument();
  });

  it('repassa conversations/pinnedIds/favoriteIds de conversationActions para a VirtualizedRealtimeList', () => {
    const props = baseProps([{ contact: { id: 'c1' } }, { contact: { id: 'c2' } }]);
    props.conversationActions = {
      pinnedIds: new Set(['c1']),
      favoriteIds: new Set(['c1', 'c2']),
      isPinned: vi.fn(() => false),
      isFavorite: vi.fn(() => false),
      pinConversation: vi.fn(),
      unpinConversation: vi.fn(),
      favoriteContact: vi.fn(),
      unfavoriteContact: vi.fn(),
      snoozeConversation: vi.fn(),
      archiveContact: vi.fn(),
      transferContact: vi.fn(),
      profileId: 'me',
    } as unknown as typeof props.conversationActions;
    render(<ConversationListSidebar {...props} />);

    const stub = screen.getByTestId('vrl-stub');
    expect(stub).toHaveAttribute('data-conversations-count', '2');
    expect(stub).toHaveAttribute('data-pinned-count', '1');
    expect(stub).toHaveAttribute('data-favorite-count', '2');
  });

  it('sem conversationActions, arquivar mostra toast de indisponível em vez de quebrar', async () => {
    const { toast } = await import('sonner');
    const props = baseProps([{ contact: { id: 'c1' } }]);
    render(<ConversationListSidebar {...props} />);

    fireEvent.click(screen.getByText('arquivar-c1'));

    expect(toast.error).toHaveBeenCalledWith('Ação indisponível — tente recarregar a página');
  });

  it('com conversationActions, arquivar chama archiveContact e refetch', async () => {
    const archiveContact = vi.fn();
    const props = baseProps([{ contact: { id: 'c1' } }]);
    props.conversationActions = {
      pinnedIds: new Set(),
      favoriteIds: new Set(),
      isPinned: vi.fn(() => false),
      isFavorite: vi.fn(() => false),
      pinConversation: vi.fn(),
      unpinConversation: vi.fn(),
      favoriteContact: vi.fn(),
      unfavoriteContact: vi.fn(),
      snoozeConversation: vi.fn(),
      archiveContact,
      transferContact: vi.fn(),
      profileId: 'me',
    } as unknown as typeof props.conversationActions;
    render(<ConversationListSidebar {...props} />);

    fireEvent.click(screen.getByText('arquivar-c1'));

    expect(archiveContact).toHaveBeenCalledWith('c1');
    // handleArchive é async — o refetch só roda depois do await, em outra microtask.
    await waitFor(() => expect(props.inbox.refetch).toHaveBeenCalled());
  });
});
