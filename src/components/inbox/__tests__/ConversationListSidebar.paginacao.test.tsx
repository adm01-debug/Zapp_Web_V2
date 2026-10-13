/**
 * Cartão t_a533b441 — a lista de conversas não tinha paginação nem estado de
 * "carregando mais" (PD-74). A sidebar passa a exibir, no fim da lista:
 *  - botão acessível "Carregar mais conversas" (teclado, aria-busy) que chama
 *    inbox.loadMore;
 *  - anúncio para leitor de tela (role=status) enquanto carrega, e esqueleto
 *    SOMENTE da página que está chegando (a lista já carregada permanece);
 *  - indicador de fim da lista quando não há mais páginas.
 * Contrato consumido de useRealtimeInbox: `hasMore`, `loadingMore`, `loadMore`
 * (os mesmos nomes expostos por useRealtimeMessages). Sem `loadMore` o rodapé
 * não aparece — nunca afirmamos "fim da lista" com a paginação não ligada.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  VirtualizedRealtimeList: () => <div data-testid="vrl-stub" />,
}));
vi.mock('@/components/inbox/CloseConversationDialog', () => ({
  CloseConversationDialog: () => null,
}));
vi.mock('@/components/inbox/TransferDialog', () => ({ TransferDialog: () => null }));

import { ConversationListSidebar } from '@/components/inbox/ConversationListSidebar';

function baseProps(
  inboxExtra: Record<string, unknown> = {},
  filteredConversations: Array<{ contact: { id: string } }> = [{ contact: { id: 'c1' } }],
) {
  return {
    inbox: {
      selectedContactId: null,
      isOnline: true,
      cachedConversations: filteredConversations,
      loading: false,
      initialLoading: false,
      refetch: vi.fn(),
      handleSelectConversation: vi.fn(),
      ...inboxExtra,
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

describe('ConversationListSidebar — carregar mais na lista de conversas (PD-74)', () => {
  it('com hasMore, mostra o botão "Carregar mais conversas" e o clique chama inbox.loadMore uma vez', () => {
    const loadMore = vi.fn();
    const props = baseProps({ hasMore: true, loadingMore: false, loadMore });
    render(<ConversationListSidebar {...props} />);

    const botao = screen.getByRole('button', { name: 'Carregar mais conversas' });
    expect(botao).toBeEnabled();
    expect(botao).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(botao);

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('enquanto loadingMore: botão desabilitado com aria-busy, esqueleto só da página nova e anúncio para leitor de tela', () => {
    const props = baseProps({ hasMore: true, loadingMore: true, loadMore: vi.fn() });
    render(<ConversationListSidebar {...props} />);

    const botao = screen.getByTestId('conversas-carregar-mais');
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('aria-busy', 'true');

    // A lista já carregada continua na tela; o esqueleto é só da página que chega.
    expect(screen.getByTestId('vrl-stub')).toBeInTheDocument();
    expect(screen.getByTestId('conversas-pagina-nova-skeleton')).toBeInTheDocument();

    // Região viva: o leitor de tela é avisado do carregamento.
    expect(screen.getByTestId('conversas-paginacao-aviso')).toHaveTextContent(
      'Carregando mais conversas…',
    );
  });

  it('sem mais páginas (hasMore falso), mostra o fim da lista e nenhum botão', () => {
    const props = baseProps({ hasMore: false, loadingMore: false, loadMore: vi.fn() });
    render(<ConversationListSidebar {...props} />);

    expect(screen.getByTestId('conversas-fim-lista')).toHaveTextContent(
      'Você chegou ao fim da lista.',
    );
    expect(screen.queryByTestId('conversas-carregar-mais')).not.toBeInTheDocument();
  });

  it('sem loadMore no hook (paginação não ligada), não mostra botão nem "fim da lista"', () => {
    const props = baseProps({});
    render(<ConversationListSidebar {...props} />);

    expect(screen.queryByTestId('conversas-carregar-mais')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversas-fim-lista')).not.toBeInTheDocument();
  });

  it('com a lista vazia, o rodapé de paginação não aparece', () => {
    const props = baseProps({ hasMore: true, loadingMore: false, loadMore: vi.fn() }, []);
    render(<ConversationListSidebar {...props} />);

    expect(screen.queryByTestId('conversas-paginacao')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversas-carregar-mais')).not.toBeInTheDocument();
  });
});
