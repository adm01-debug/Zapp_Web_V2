/**
 * Cartão t_1e46d653 — ordem da barra do topo da lista de conversas no desktop:
 *  1) título "Conversas" com UM botão de atualizar (calls inbox.refetch);
 *  2) chips de status logo abaixo;
 *  3) separador + linha com Filtros + campo de busca;
 *  4) separador + lista.
 * O bug antigo: dois botões de atualizar (o da barra e o interno do InboxFilters)
 * e chips depois da busca/filtros.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// Registra as props que a sidebar entrega ao InboxFilters: no desktop ela NÃO
// deve passar onRefetch/isRefetching (era o segundo botão de atualizar).
const inboxFiltersProps = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/mobile/MobilePullToRefresh', () => ({
  MobilePullToRefreshIndicator: () => null,
}));
vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/inbox/BulkActionsToolbar', () => ({ BulkActionsToolbar: () => null }));
vi.mock('@/components/inbox/InboxFilters', () => ({
  InboxFilters: (props: Record<string, unknown>) => {
    inboxFiltersProps.current = props;
    return <button type="button" data-testid="filtros">Filtros</button>;
  },
}));
vi.mock('@/components/inbox/conversation-list/StatusChips', () => ({
  StatusChips: () => <div data-testid="status-chips" />,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/inbox/VirtualizedRealtimeList', () => ({
  VirtualizedRealtimeList: () => <div data-testid="vrl-stub" />,
}));
vi.mock('@/components/inbox/CloseConversationDialog', () => ({
  CloseConversationDialog: () => null,
}));
vi.mock('@/components/inbox/TransferDialog', () => ({ TransferDialog: () => null }));

import { ConversationListSidebar } from '@/components/inbox/ConversationListSidebar';

function baseProps() {
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
      filteredConversations: [{ contact: { id: 'c1' } }],
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

describe('ConversationListSidebar — barra do topo no desktop', () => {
  it('tem exatamente um botão de atualizar, ao lado do título, e ele chama inbox.refetch', () => {
    const props = baseProps();
    render(<ConversationListSidebar {...props} />);

    const botoes = screen.getAllByLabelText('Atualizar conversas');
    expect(botoes).toHaveLength(1);

    fireEvent.click(botoes[0]);
    expect(props.inbox.refetch).toHaveBeenCalledTimes(1);

    // O botão fica no mesmo bloco do título, antes dos chips/busca.
    const titulo = screen.getByRole('heading', { name: 'Conversas' });
    expect(titulo.parentElement).toContainElement(botoes[0]);
  });

  it('desktop: InboxFilters não recebe onRefetch (nada de segundo botão de atualizar)', () => {
    render(<ConversationListSidebar {...baseProps()} />);

    expect(inboxFiltersProps.current).toBeDefined();
    expect(inboxFiltersProps.current?.onRefetch).toBeUndefined();
    expect(inboxFiltersProps.current?.isRefetching).toBeUndefined();
    // O botão de atualizar antigo (title="Atualizar") não existe mais na tela.
    expect(screen.queryByTitle('Atualizar')).not.toBeInTheDocument();
  });

  it('ordem: chips de status vêm antes da busca, que vem antes do InboxFilters', () => {
    render(<ConversationListSidebar {...baseProps()} />);

    const chips = screen.getByTestId('status-chips');
    const busca = screen.getByLabelText('Buscar contato pelo nome');
    const filtros = screen.getByTestId('filtros');

    const depois = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

    expect(depois(chips, busca)).toBe(true);
    // "Filtros + campo Buscar" na mesma linha: Filtros antes da busca.
    expect(depois(filtros, busca)).toBe(true);
  });
});
