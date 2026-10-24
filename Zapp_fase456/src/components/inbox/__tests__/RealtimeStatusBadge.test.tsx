/**
 * Cartão t_b23807e6 — selo "Reconectando…" no cabeçalho da lista de conversas.
 * O componente REAL é renderizado sobre o store REAL; o que se controla é o
 * estado dos canais (como o `useSupabaseRealtime` faria em produção).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/mobile/MobilePullToRefresh', () => ({
  MobilePullToRefreshIndicator: () => null,
}));
vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/inbox/BulkActionsToolbar', () => ({ BulkActionsToolbar: () => null }));
vi.mock('@/components/inbox/InboxFilters', () => ({
  InboxFilters: () => <button type="button" data-testid="filtros">Filtros</button>,
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

import { RealtimeStatusBadge } from '@/components/inbox/RealtimeStatusBadge';
import { ConversationListSidebar } from '@/components/inbox/ConversationListSidebar';
import {
  REALTIME_STALE_GRACE_MS,
  resetRealtimeStatus,
  setRealtimeChannelStatus,
} from '@/hooks/realtime/realtimeStatusStore';

const SELO = 'Reconectando…';

describe('RealtimeStatusBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRealtimeStatus();
  });

  afterEach(() => {
    resetRealtimeStatus();
    vi.useRealTimers();
  });

  it('não mostra nada enquanto o canal está conectado', () => {
    act(() => setRealtimeChannelStatus('global-contacts-realtime', 'connected'));
    render(<RealtimeStatusBadge />);

    act(() => vi.advanceTimersByTime(REALTIME_STALE_GRACE_MS * 3));
    expect(screen.queryByTestId('realtime-status-badge')).not.toBeInTheDocument();
    expect(screen.queryByText(SELO)).not.toBeInTheDocument();
  });

  it('mostra o selo depois de 5 s sem canal Realtime', () => {
    act(() => setRealtimeChannelStatus('global-contacts-realtime', 'error'));
    render(<RealtimeStatusBadge />);

    // Antes da carência: nada na tela.
    act(() => vi.advanceTimersByTime(REALTIME_STALE_GRACE_MS - 1));
    expect(screen.queryByTestId('realtime-status-badge')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    const selo = screen.getByTestId('realtime-status-badge');
    expect(selo).toHaveTextContent(SELO);
    expect(selo).toHaveAttribute('role', 'status');
  });

  it('some sozinho quando a conexão volta', () => {
    act(() => setRealtimeChannelStatus('global-contacts-realtime', 'error'));
    render(<RealtimeStatusBadge />);
    act(() => vi.advanceTimersByTime(REALTIME_STALE_GRACE_MS));
    expect(screen.getByTestId('realtime-status-badge')).toBeInTheDocument();

    act(() => setRealtimeChannelStatus('global-contacts-realtime', 'connected'));

    expect(screen.queryByTestId('realtime-status-badge')).not.toBeInTheDocument();
  });
});

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

describe('ConversationListSidebar — cabeçalho com o selo Realtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRealtimeStatus();
  });

  afterEach(() => {
    resetRealtimeStatus();
    vi.useRealTimers();
  });

  it('mostra o selo no cabeçalho quando a queda passa de 5 s', async () => {
    act(() => setRealtimeChannelStatus('global-messages-realtime', 'error'));

    render(<ConversationListSidebar {...baseProps()} />);
    expect(screen.queryByTestId('realtime-status-badge')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(REALTIME_STALE_GRACE_MS);
    });

    const selo = screen.getByTestId('realtime-status-badge');
    expect(selo).toHaveTextContent(SELO);
    // Está no bloco do cabeçalho, junto do título "Conversas".
    const titulo = screen.getByRole('heading', { name: 'Conversas' });
    const cabecalho = titulo.closest('.px-4');
    expect(cabecalho).not.toBeNull();
    expect(cabecalho).toContainElement(selo);
  });
});
