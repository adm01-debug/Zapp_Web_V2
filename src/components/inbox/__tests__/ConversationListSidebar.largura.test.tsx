/**
 * Cartão t_4947d288 — largura da lista de conversas ajustável (paridade V3).
 *
 * Antes: a lista era `w-[350px]` fixo. Agora arrasta de 280 a 600 px, lembra a
 * escolha em localStorage, setas do teclado ajustam de 16 em 16 px e o duplo
 * clique restaura o padrão.
 *
 * A prova olha o DOM real (largura aplicada via `style`, aria do separador e o
 * valor persistido), sem mock do próprio comportamento.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const STORAGE_KEY = 'zapp:inbox:sidebar-width';

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

function larguraAtual(): string {
  return (screen.getByTestId('conversation-list-sidebar') as HTMLElement).style.width;
}

function separador(): HTMLElement {
  return screen.getByTestId('conversation-list-resize-handle');
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('ConversationListSidebar — largura ajustável', () => {
  it('sem nada lembrado, começa no padrão de 350px e o separador anuncia min/máx', () => {
    render(<ConversationListSidebar {...baseProps()} />);

    expect(larguraAtual()).toBe('350px');
    const handle = separador();
    expect(handle).toHaveAttribute('role', 'separator');
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-valuenow', '350');
    expect(handle).toHaveAttribute('aria-valuemin', '280');
    expect(handle).toHaveAttribute('aria-valuemax', '600');
  });

  it('lembra a largura: valor salvo em localStorage é restaurado ao montar', () => {
    window.localStorage.setItem(STORAGE_KEY, '480');
    render(<ConversationListSidebar {...baseProps()} />);

    expect(larguraAtual()).toBe('480px');
  });

  it('usa o padrão quando o valor lembrado é inválido', () => {
    window.localStorage.setItem(STORAGE_KEY, 'não-é-número');
    render(<ConversationListSidebar {...baseProps()} />);

    expect(larguraAtual()).toBe('350px');
  });

  it('setas do teclado ajustam de 16 em 16 px e persistem', () => {
    render(<ConversationListSidebar {...baseProps()} />);
    const handle = separador();

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(larguraAtual()).toBe('366px');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('366');

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(larguraAtual()).toBe('350px');

    fireEvent.keyDown(handle, { key: 'End' });
    expect(larguraAtual()).toBe('600px');

    fireEvent.keyDown(handle, { key: 'Home' });
    expect(larguraAtual()).toBe('280px');
  });

  it('não passa do mínimo ao apertar a seta esquerda repetidas vezes', () => {
    render(<ConversationListSidebar {...baseProps()} />);
    const handle = separador();

    for (let i = 0; i < 20; i += 1) fireEvent.keyDown(handle, { key: 'ArrowLeft' });

    expect(larguraAtual()).toBe('280px');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('280');
  });

  it('arrasta pelo separador respeitando o teto de 600px', () => {
    render(<ConversationListSidebar {...baseProps()} />);
    const handle = separador();

    fireEvent.mouseDown(handle);
    fireEvent.mouseMove(document, { clientX: 450 });
    expect(larguraAtual()).toBe('450px');

    fireEvent.mouseMove(document, { clientX: 900 });
    expect(larguraAtual()).toBe('600px');

    fireEvent.mouseUp(document);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('600');
  });

  it('duplo clique no separador restaura o padrão', () => {
    window.localStorage.setItem(STORAGE_KEY, '520');
    render(<ConversationListSidebar {...baseProps()} />);
    expect(larguraAtual()).toBe('520px');

    fireEvent.doubleClick(separador());

    expect(larguraAtual()).toBe('350px');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('350');
  });
});
